// Simple static server + API proxy for self-hosted Docker runtime
// - Serves ./dist as static assets with SPA fallback
// - Proxies /api/* to CONVEX_SITE_URL preserving method/headers/body

import http from "node:http";
import { createReadStream, readFileSync, statSync, existsSync } from "node:fs";
import { extname, resolve } from "node:path";
import { fetchOgMeta, injectMetaTags, SITE_URL } from "./lib/seoInject.mjs";
import { forwardTo } from "./lib/proxy.mjs";

const DIST_DIR = resolve("./dist");
const DIST_PATH_PREFIX = `${DIST_DIR}${DIST_DIR.endsWith("/") ? "" : "/"}`;
const PORT = process.env.PORT || 3000;
// Prefer explicit CONVEX_SITE_URL when provided; otherwise derive from
// VITE_CONVEX_URL by swapping .convex.cloud → .convex.site
const deriveConvexSite = (val = "") => {
  if (!val) return "";
  try {
    const u = new URL(val);
    const host = u.host.replace(".convex.cloud", ".convex.site");
    return `${u.protocol}//${host}`.replace(/\/+$/, "");
  } catch (error) {
    console.error("FATAL: VITE_CONVEX_URL is not a valid URL", {
      value: val,
      error,
    });
    process.exit(1);
  }
};

const CONVEX_SITE_URL = (
  process.env.CONVEX_SITE_URL || deriveConvexSite(process.env.VITE_CONVEX_URL)
).replace(/\/+$/, "");

if (!CONVEX_SITE_URL) {
  console.error(
    "ERROR: Set CONVEX_SITE_URL env (e.g., https://<deployment>.convex.site)",
  );
  process.exit(1);
}

// Cache the HTML template at startup for meta tag injection
const INDEX_HTML_PATH = resolve(DIST_DIR, "index.html");
const cachedIndexHtml = existsSync(INDEX_HTML_PATH)
  ? readFileSync(INDEX_HTML_PATH, "utf-8")
  : "";

const mime = new Map([
  [".html", "text/html; charset=utf-8"],
  [".css", "text/css; charset=utf-8"],
  [".js", "application/javascript; charset=utf-8"],
  [".mjs", "application/javascript; charset=utf-8"],
  [".json", "application/json; charset=utf-8"],
  [".svg", "image/svg+xml"],
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".ico", "image/x-icon"],
  [".txt", "text/plain; charset=utf-8"],
  [".woff", "font/woff"],
  [".woff2", "font/woff2"],
]);

// Minimal IP-based rate limiter for publish endpoint
const PUBLISH_MAX = Number(process.env.RATELIMIT_PUBLISH_MAX || 10); // requests
const PUBLISH_WINDOW_MS = Number(
  process.env.RATELIMIT_PUBLISH_WINDOW_MS || 5 * 60 * 1000,
); // 5 minutes
const publishHits = new Map(); // key -> array of timestamps

/** Check rate limit and atomically record the hit in one step. */
function checkAndRecordHit(remote) {
  const now = Date.now();
  const key = remote || "unknown";
  const fresh = (publishHits.get(key) || []).filter(
    (t) => now - t < PUBLISH_WINDOW_MS,
  );
  if (fresh.length >= PUBLISH_MAX) {
    publishHits.set(key, fresh);
    return {
      limited: true,
      remaining: 0,
      resetMs: Math.max(0, PUBLISH_WINDOW_MS - (now - fresh[0] || 0)),
    };
  }
  fresh.push(now);
  publishHits.set(key, fresh);
  return {
    limited: false,
    remaining: Math.max(0, PUBLISH_MAX - fresh.length),
    resetMs: PUBLISH_WINDOW_MS,
  };
}

function sendFile(res, filePath) {
  try {
    const st = statSync(filePath);
    const type = mime.get(extname(filePath)) || "application/octet-stream";
    res.writeHead(200, {
      "Content-Type": type,
      "Content-Length": st.size,
      "Cache-Control": filePath.includes("/assets/")
        ? "public, max-age=31536000, immutable"
        : "no-cache",
    });
    createReadStream(filePath).pipe(res);
  } catch (error) {
    console.error("Failed to serve file", { filePath, error });
    res.writeHead(404);
    res.end("Not found");
  }
}

async function proxyApi(req, res) {
  const target = `${CONVEX_SITE_URL}${req.url}`;
  return forwardTo(target, req, res);
}

function parseRequestPath(rawUrl) {
  const safeRaw = typeof rawUrl === "string" ? rawUrl : "/";
  const rawPath = safeRaw.split("?")[0] || "/";
  try {
    const decoded = decodeURIComponent(rawPath);
    return decoded.startsWith("/") ? decoded : `/${decoded}`;
  } catch (error) {
    console.error("Failed to decode request path", { rawPath, error });
    return null;
  }
}

const API_ROUTE_PREFIX = "/api/";
const SHARE_PUBLIC_RE = /^\/([sp])\/([A-Za-z0-9_-]+)/;

function parseSharePublicIds(urlPath) {
  const match = urlPath.match(SHARE_PUBLIC_RE);
  if (!match) return null;
  const isShare = match[1] === "s";
  return {
    qp: isShare
      ? `shareId=${encodeURIComponent(match[2])}`
      : `publicId=${encodeURIComponent(match[2])}`,
    routePrefix: isShare ? "/s/" : "/p/",
    routeId: match[2],
  };
}

async function handleApiRoute(req, res) {
  if (
    req.method === "POST" &&
    req.url.startsWith(`${API_ROUTE_PREFIX}publishChat`)
  ) {
    const remote = req.socket?.remoteAddress || req.headers["x-forwarded-for"];
    const rl = checkAndRecordHit(String(remote || ""));
    if (rl.limited) {
      res.writeHead(429, {
        "Content-Type": "application/json",
        "Retry-After": String(Math.ceil(rl.resetMs / 1000)),
        "X-RateLimit-Limit": String(PUBLISH_MAX),
        "X-RateLimit-Remaining": String(rl.remaining),
      });
      res.end(
        JSON.stringify({
          error: "Too Many Requests",
          retryAfterMs: rl.resetMs,
        }),
      );
      return;
    }
  }
  await proxyApi(req, res);
}

function wantsPlainText(req) {
  const accept = String(req.headers["accept"] || "").toLowerCase();
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  return (
    accept.includes("text/plain") ||
    accept.includes("text/markdown") ||
    /curl|wget|httpie|python-requests|go-http-client|httpclient/.test(ua)
  );
}

async function handleSharePublicRoute(req, res, ids) {
  if (wantsPlainText(req)) {
    const target = `${CONVEX_SITE_URL}/api/chatTextMarkdown?${ids.qp}`;
    await forwardTo(target, req, res);
    return;
  }

  if (!cachedIndexHtml) {
    console.warn(
      "[ogMeta] Startup HTML cache is empty; serving raw index.html without meta injection",
      {
        queryString: ids.qp,
      },
    );
    sendFile(res, resolve(DIST_DIR, "index.html"));
    return;
  }

  const canonicalUrl = `${SITE_URL}${ids.routePrefix}${ids.routeId}`;
  const result = await fetchOgMeta(CONVEX_SITE_URL, ids.qp);

  if (!result.ok) {
    console.error("[ogMeta] Infrastructure failure fetching metadata", {
      queryString: ids.qp,
      error: result.error,
    });
    res.writeHead(502, {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Length": Buffer.byteLength(cachedIndexHtml),
      "Cache-Control": "no-store",
      "X-OG-Meta-Status": "error",
    });
    res.end(cachedIndexHtml);
    return;
  }

  if (!result.data) {
    console.warn(
      "[ogMeta] No metadata returned for route; serving uninjected HTML",
      {
        queryString: ids.qp,
      },
    );
  }

  const html = result.data
    ? injectMetaTags({ html: cachedIndexHtml, meta: result.data, canonicalUrl })
    : cachedIndexHtml;
  const cacheControl = result.data ? "public, max-age=60" : "no-cache";
  const ogMetaStatus = result.data ? "resolved" : "not-found";

  res.writeHead(200, {
    "Content-Type": "text/html; charset=utf-8",
    "Content-Length": Buffer.byteLength(html),
    "Cache-Control": cacheControl,
    "X-OG-Meta-Status": ogMetaStatus,
  });
  res.end(html);
}

function serveStatic(res, urlPath) {
  const staticPath = urlPath === "/" ? "/index.html" : urlPath;
  const filePath = resolve(DIST_DIR, `.${staticPath}`);
  if (!filePath.startsWith(DIST_PATH_PREFIX)) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    sendFile(res, filePath);
    return;
  }
  sendFile(res, resolve(DIST_DIR, "index.html"));
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  const urlPath = parseRequestPath(req.url);
  if (!urlPath) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (urlPath === "/sitemap.xml") {
    await forwardTo(`${CONVEX_SITE_URL}/sitemap.xml`, req, res);
    return;
  }
  if (req.url.startsWith(API_ROUTE_PREFIX)) {
    await handleApiRoute(req, res);
    return;
  }
  const sharePublicIds = parseSharePublicIds(urlPath);
  if (sharePublicIds) {
    await handleSharePublicRoute(req, res, sharePublicIds);
    return;
  }
  serveStatic(res, urlPath);
});

server.listen(PORT, () => {
  console.info(`Server listening on http://0.0.0.0:${PORT}`);
  console.info(`Proxying /api -> ${CONVEX_SITE_URL}`);
});
