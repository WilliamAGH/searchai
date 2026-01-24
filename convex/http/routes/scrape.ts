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
import { validateScrapeUrl } from "../../lib/url";

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
      const payload =
        rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : null;
      if (!payload) {
        return corsResponse(
          JSON.stringify({ error: "Invalid request payload" }),
          400,
          origin,
        );
      }
      const urlInput = String(payload.url || "").slice(0, 2048);

      const validation = validateScrapeUrl(urlInput);
      if (!validation.ok) {
        return corsResponse(
          JSON.stringify({ error: validation.error }),
          400,
          origin,
        );
      }
      const url = validation.url;

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
