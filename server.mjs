// Simple static server + API proxy for self-hosted Docker runtime
// - Serves ./dist as static assets with SPA fallback
// - Proxies /api/* to CONVEX_SITE_URL preserving method/headers/body

import http from "node:http";
import { createReadStream, statSync, existsSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { Readable } from "node:stream";

const DIST_DIR = resolve("./dist");
const PORT = process.env.PORT || 3000;
// Prefer explicit CONVEX_SITE_URL when provided; otherwise derive from
// VITE_CONVEX_URL by swapping .convex.cloud → .convex.site
const deriveConvexSite = (val = "") => {
  try {
    if (!val) return "";
    const u = new URL(val);
    const host = u.host.replace(".convex.cloud", ".convex.site");
    return `${u.protocol}//${host}`.replace(/\/+$/, "");
  } catch {
    return (val || "").replace(/\/+$/, "");
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

function rateLimited(remote, now = Date.now()) {
  const key = remote || "unknown";
  const arr = publishHits.get(key) || [];
  const fresh = arr.filter((t) => now - t < PUBLISH_WINDOW_MS);
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
  } catch {
    res.writeHead(404);
    res.end("Not found");
  }
}

async function forwardTo(target, req, res) {
  try {
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v !== undefined)
        headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    headers.set("host", new URL(CONVEX_SITE_URL).host);

    const init = {
      method: req.method,
      headers,
      body: undefined,
      redirect: "manual",
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      // Collect request body
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }
    const resp = await fetch(target, init);
    const outHeaders = {};
    resp.headers.forEach((v, k) => {
      outHeaders[k] = v;
    });
    res.writeHead(resp.status, outHeaders);
    if (resp.body) {
      const nodeStream = Readable.fromWeb(resp.body);
      nodeStream.pipe(res);
    } else {
      res.end();
    }
  } catch (e) {
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad gateway", details: String(e) }));
  }
}

async function proxyApi(req, res) {
  const target = `${CONVEX_SITE_URL}${req.url}`;
  return forwardTo(target, req, res);
}

const server = http.createServer(async (req, res) => {
  if (!req.url) {
    res.writeHead(400);
    res.end("Bad request");
    return;
  }
  if (req.url.startsWith("/api/")) {
    // Rate-limit POST /api/publishChat
    if (req.method === "POST" && req.url.startsWith("/api/publishChat")) {
      const remote =
        req.socket?.remoteAddress || req.headers["x-forwarded-for"];
      const rl = rateLimited(String(remote || ""));
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
    return void proxyApi(req, res);
  }
  // Conditional LLM/plain rewrite for shared/public routes
  const accept = String(req.headers["accept"] || "").toLowerCase();
  const ua = String(req.headers["user-agent"] || "").toLowerCase();
  const wantsPlain =
    accept.includes("text/plain") ||
    accept.includes("text/markdown") ||
    /curl|wget|httpie|python-requests|go-http-client|httpclient/.test(ua);
  try {
    const pathOnly = decodeURIComponent(req.url.split("?")[0] || "/");
    const shareMatch = pathOnly.match(/^\/s\/([A-Za-z0-9_-]+)/);
    const publicMatch = pathOnly.match(/^\/p\/([A-Za-z0-9_-]+)/);
    if (wantsPlain && (shareMatch || publicMatch)) {
      const qp = shareMatch
        ? `shareId=${encodeURIComponent(shareMatch[1])}`
        : `publicId=${encodeURIComponent(publicMatch[1])}`;
      const target = `${CONVEX_SITE_URL}/api/chatTextMarkdown?${qp}`;
      return void forwardTo(target, req, res);
    }
  } catch {}

  // Static file try
  const urlPath = decodeURIComponent(req.url.split("?")[0]);
  const filePath = join(DIST_DIR, urlPath === "/" ? "/index.html" : urlPath);
  if (existsSync(filePath) && statSync(filePath).isFile()) {
    return sendFile(res, filePath);
  }
  // SPA fallback
  return sendFile(res, join(DIST_DIR, "index.html"));
});

server.listen(PORT, () => {
  console.info(`Server listening on http://0.0.0.0:${PORT}`);
  console.info(`Proxying /api -> ${CONVEX_SITE_URL}`);
});
