// HTTP proxy forwarding for Convex site URL
// Strips hop-by-hop headers and streams response bodies.

import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

const HOP_BY_HOP_HEADERS = new Set([
  "connection",
  "keep-alive",
  "proxy-authenticate",
  "proxy-authorization",
  "te",
  "trailer",
  "transfer-encoding",
  "upgrade",
  "content-encoding",
  "content-length",
]);

/**
 * Forward an incoming request to `target`, streaming the response back.
 * Hop-by-hop and framing headers are stripped in both directions.
 */
export async function forwardTo(target, req, res) {
  try {
    const targetUrl = new URL(target);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined) continue;
      const key = k.toLowerCase();
      if (key === "connection" || key === "host") continue;
      headers.set(k, Array.isArray(v) ? v.join(", ") : String(v));
    }
    headers.set("host", targetUrl.host);
    // Undici's fetch transparently decompresses by default, which can make
    // content-encoding/content-length from the upstream response incorrect
    // for the bytes we stream to the client. Force identity to avoid that.
    headers.set("accept-encoding", "identity");

    const init = {
      method: req.method,
      headers,
      body: undefined,
      redirect: "manual",
    };
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks = [];
      for await (const chunk of req) chunks.push(chunk);
      init.body = Buffer.concat(chunks);
    }
    const resp = await fetch(target, init);
    const outHeaders = {};
    resp.headers.forEach((v, k) => {
      if (!HOP_BY_HOP_HEADERS.has(k.toLowerCase())) outHeaders[k] = v;
    });
    res.writeHead(resp.status, outHeaders);
    if (resp.body) {
      await pipeline(Readable.fromWeb(resp.body), res);
    } else {
      res.end();
    }
  } catch (e) {
    console.error("Proxy forward failed", { target, error: e });
    if (res.headersSent) {
      res.destroy(e instanceof Error ? e : new Error(String(e)));
      return;
    }
    res.writeHead(502, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: "Bad gateway", details: String(e) }));
  }
}
