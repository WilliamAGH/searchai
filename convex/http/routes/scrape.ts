/**
 * Scrape route handlers
 * - OPTIONS and POST /api/scrape endpoints
 */

import { httpAction } from "../../_generated/server";
import { internal } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";

/**
 * Register scrape routes on the HTTP router
 */
export function registerScrapeRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/scrape
  http.route({
    path: "/api/scrape",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      const requested = request.headers.get("Access-Control-Request-Headers");
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
          "Access-Control-Allow-Headers": requested || "Content-Type",
          "Access-Control-Max-Age": "600",
          Vary: "Origin",
        },
      });
    }),
  });

  // URL scraping endpoint
  http.route({
    path: "/api/scrape",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid JSON body" }),
          400,
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
          );
        }

        // SSRF Protection: Block private IPs and internal networks
        const hostname = urlObj.hostname.toLowerCase();

        // Allow localhost in development mode for testing
        const isDevelopment =
          process.env.NODE_ENV === "development" ||
          process.env.CONVEX_DEPLOYMENT?.includes("dev") ||
          !process.env.CONVEX_DEPLOYMENT;

        // Block localhost and loopback (except in development)
        if (
          !isDevelopment &&
          (hostname === "localhost" ||
            hostname === "127.0.0.1" ||
            hostname === "::1" ||
            hostname.startsWith("127.") ||
            hostname === "0.0.0.0")
        ) {
          return corsResponse(
            JSON.stringify({
              error: "Access to local addresses is not allowed",
            }),
            400,
          );
        }

        // Block private IP ranges (RFC 1918) - except in development
        if (!isDevelopment) {
          const ipPattern = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;
          const ipMatch = hostname.match(ipPattern);
          if (ipMatch) {
            const [, a, b, _c, _d] = ipMatch.map(Number);

            // 10.0.0.0/8
            if (a === 10) {
              return corsResponse(
                JSON.stringify({
                  error: "Access to private networks is not allowed",
                }),
                400,
              );
            }

            // 172.16.0.0/12
            if (a === 172 && b >= 16 && b <= 31) {
              return corsResponse(
                JSON.stringify({
                  error: "Access to private networks is not allowed",
                }),
                400,
              );
            }

            // 192.168.0.0/16
            if (a === 192 && b === 168) {
              return corsResponse(
                JSON.stringify({
                  error: "Access to private networks is not allowed",
                }),
                400,
              );
            }

            // 169.254.0.0/16 (link-local)
            if (a === 169 && b === 254) {
              return corsResponse(
                JSON.stringify({
                  error: "Access to link-local addresses is not allowed",
                }),
                400,
              );
            }
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
          );
        }

        url = urlObj.toString();
      } catch {
        return corsResponse(
          JSON.stringify({ error: "Invalid URL format" }),
          400,
        );
      }

      dlog("🌐 SCRAPE ENDPOINT CALLED:");
      dlog("URL:", url);

      try {
        // @ts-ignore - Known Convex TS2589 type instantiation issue
        const result = await ctx.runAction(internal.search.scrapeUrl, { url });

        dlog("🌐 SCRAPE RESULT:", JSON.stringify(result, null, 2));

        return corsResponse(JSON.stringify(result));
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

        return corsResponse(JSON.stringify(errorResponse));
      }
    }),
  });
}
