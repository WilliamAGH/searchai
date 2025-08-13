/**
 * Scrape route handlers
 * - OPTIONS and POST /api/scrape endpoints
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
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
      const { url } = await request.json();

      dlog("🌐 SCRAPE ENDPOINT CALLED:");
      dlog("URL:", url);

      try {
        const result = await ctx.runAction(api.search.scrapeUrl, { url });

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
