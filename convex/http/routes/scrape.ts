/**
 * Scrape route handlers
 * - OPTIONS and POST /api/scrape endpoints
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";
import { corsPreflightResponse } from "../cors";
import { checkIpRateLimit } from "../../lib/rateLimit";

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4Parts(hostname: string): number[] | null {
  const match = hostname.match(IPV4_PATTERN);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isIpv4PrivateParts([a, b]: number[]): boolean {
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function extractEmbeddedIpv4(hostname: string): number[] | null {
  const lastPart = hostname.split(":").pop();
  if (!lastPart || !lastPart.includes(".")) return null;
  return parseIpv4Parts(lastPart);
}

function parseIpv6ToBigInt(hostname: string): bigint | null {
  if (!hostname) return null;
  if (hostname.includes("%")) return null;
  const lower = hostname.toLowerCase();
  const doubleColonIndex = lower.indexOf("::");
  if (
    doubleColonIndex !== -1 &&
    lower.indexOf("::", doubleColonIndex + 1) !== -1
  ) {
    return null;
  }

  let head = lower;
  let tail = "";
  if (doubleColonIndex !== -1) {
    const parts = lower.split("::");
    head = parts[0] ?? "";
    tail = parts[1] ?? "";
  }

  const expandParts = (partsRaw: string[]) => {
    const parts: string[] = [];
    for (const part of partsRaw) {
      if (!part) return null;
      if (part.includes(".")) {
        const ipv4Parts = parseIpv4Parts(part);
        if (!ipv4Parts) return null;
        const part1 = ((ipv4Parts[0] << 8) | ipv4Parts[1]).toString(16);
        const part2 = ((ipv4Parts[2] << 8) | ipv4Parts[3]).toString(16);
        parts.push(part1, part2);
      } else {
        parts.push(part);
      }
    }
    return parts;
  };

  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const expandedHead = expandParts(headParts);
  if (!expandedHead) return null;
  const expandedTail = expandParts(tailParts);
  if (!expandedTail) return null;

  let parts: string[];
  if (doubleColonIndex !== -1) {
    const fill = 8 - (expandedHead.length + expandedTail.length);
    if (fill < 0) return null;
    parts = [...expandedHead, ...Array(fill).fill("0"), ...expandedTail];
  } else {
    if (expandedHead.length !== 8) return null;
    parts = expandedHead;
  }

  if (parts.length !== 8) return null;

  let value = 0n;
  for (const part of parts) {
    const num = Number.parseInt(part, 16);
    if (!Number.isFinite(num) || num < 0 || num > 0xffff) return null;
    value = (value << 16n) + BigInt(num);
  }

  return value;
}

// IPv6 private/reserved address range boundaries (RFC 4193, RFC 4291)
const IPV6_UNIQUE_LOCAL_START = 0xfc00_0000_0000_0000_0000_0000_0000_0000n;
const IPV6_UNIQUE_LOCAL_END = 0xfdff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
const IPV6_LINK_LOCAL_START = 0xfe80_0000_0000_0000_0000_0000_0000_0000n;
const IPV6_LINK_LOCAL_END = 0xfebf_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
const IPV6_IPV4_MAPPED_START = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;
const IPV6_IPV4_MAPPED_END = 0x0000_0000_0000_0000_0000_ffff_ffff_ffffn;

function isIpv6Private(hostname: string): boolean {
  const embeddedIpv4 = extractEmbeddedIpv4(hostname);
  if (embeddedIpv4) {
    return isIpv4PrivateParts(embeddedIpv4);
  }

  const value = parseIpv6ToBigInt(hostname);
  if (value === null) return true;

  // Unspecified (::) or loopback (::1)
  if (value === 0n || value === 1n) return true;

  // Unique local addresses (fc00::/7)
  if (value >= IPV6_UNIQUE_LOCAL_START && value <= IPV6_UNIQUE_LOCAL_END)
    return true;

  // Link-local addresses (fe80::/10)
  if (value >= IPV6_LINK_LOCAL_START && value <= IPV6_LINK_LOCAL_END)
    return true;

  // IPv4-mapped IPv6 addresses (::ffff:0:0/96)
  if (value >= IPV6_IPV4_MAPPED_START && value <= IPV6_IPV4_MAPPED_END) {
    const v4 = Number(value & 0xffffffffn);
    const parts = [
      (v4 >>> 24) & 0xff,
      (v4 >>> 16) & 0xff,
      (v4 >>> 8) & 0xff,
      v4 & 0xff,
    ];
    return isIpv4PrivateParts(parts);
  }

  return false;
}

function isPrivateAddress(hostname: string): boolean {
  const ipv4Parts = parseIpv4Parts(hostname);
  if (ipv4Parts) return isIpv4PrivateParts(ipv4Parts);
  if (hostname.includes(":")) return isIpv6Private(hostname);
  return false;
}

/**
 * Register scrape routes on the HTTP router
 */
export function registerScrapeRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/scrape
  http.route({
    path: "/api/scrape",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  // URL scraping endpoint
  http.route({
    path: "/api/scrape",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse("{}", 204, origin);
      if (probe.status === 403) return probe;

      // Rate limiting check
      const rateLimit = checkIpRateLimit(request, "/api/scrape");
      if (!rateLimit.allowed) {
        return corsResponse(
          JSON.stringify({
            error: "Rate limit exceeded",
            message: "Too many scrape requests. Please try again later.",
            retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
          }),
          429,
          origin,
        );
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
          origin,
        );
      }

      // Validate and normalize input
      const payload = rawPayload as any;
      const urlInput = String(payload.url || "").slice(0, 2048);

      // Validate URL format
      let url: string;
      try {
        const urlObj = new URL(urlInput);
        // Only allow http/https protocols
        if (!["http:", "https:"].includes(urlObj.protocol)) {
          return corsResponse(
            JSON.stringify({ error: "Invalid URL protocol" }),
            400,
            origin,
          );
        }

        // SSRF Protection: Block private IPs and internal networks
        const rawHostname = urlObj.hostname.toLowerCase();
        const hostname = rawHostname.replace(/^\[|\]$/g, "");

        // Allow localhost in development mode for testing
        const deployment = process.env.CONVEX_DEPLOYMENT;
        const isDevelopment =
          process.env.NODE_ENV === "development" ||
          Boolean(deployment && deployment.includes("dev"));

        // Block localhost and loopback (except in development)
        if (
          !isDevelopment &&
          (hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1" ||
            hostname === "0:0:0:0:0:0:0:1" ||
            hostname.startsWith("127.") ||
            hostname === "0.0.0.0")
        ) {
          return corsResponse(
            JSON.stringify({
              error: "Access to local addresses is not allowed",
            }),
            400,
            origin,
          );
        }

        // Block private IP ranges (IPv4 + IPv6) - except in development
        if (!isDevelopment) {
          if (isPrivateAddress(hostname)) {
            return corsResponse(
              JSON.stringify({
                error: "Access to private networks is not allowed",
              }),
              400,
              origin,
            );
          }
        }

        // Block metadata endpoints (AWS, GCP, Azure)
        const blockedHosts = [
          "169.254.169.254", // AWS metadata
          "metadata.google.internal", // GCP metadata
          "metadata.azure.com", // Azure metadata
        ];

        if (blockedHosts.includes(hostname)) {
          return corsResponse(
            JSON.stringify({
              error: "Access to metadata endpoints is not allowed",
            }),
            400,
            origin,
          );
        }

        url = urlObj.toString();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid URL format" }),
          400,
          origin,
        );
      }

      dlog("🌐 SCRAPE ENDPOINT CALLED:");
      dlog("URL:", url);

      try {
        const result = await ctx.runAction(api.search.scraperAction.scrapeUrl, {
          url,
        });

        dlog("🌐 SCRAPE RESULT:", JSON.stringify(result, null, 2));

        return corsResponse(JSON.stringify(result), 200, origin);
      } catch (error) {
        console.error("❌ SCRAPE API ERROR:", error);

        let hostname = "";
        try {
          hostname = new URL(url).hostname;
        } catch {
          hostname = "unknown";
        }
        const errorResponse = {
          title: hostname,
          content: `Unable to fetch content from ${url}.`,
          summary: `Content unavailable from ${hostname}`,
          errorDetails: {
            timestamp: new Date().toISOString(),
          },
        };

        dlog(
          "🌐 SCRAPE ERROR RESPONSE:",
          JSON.stringify(errorResponse, null, 2),
        );

        return corsResponse(JSON.stringify(errorResponse), 200, origin);
      }
    }),
  });
}
