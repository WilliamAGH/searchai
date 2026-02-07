/**
 * Scrape route handlers
 * - OPTIONS and POST /api/scrape endpoints
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { dlog, serializeError } from "../utils";
import {
  buildUnauthorizedOriginResponse,
  corsPreflightResponse,
  corsResponse,
  validateOrigin,
} from "../cors";
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
      const origin = validateOrigin(request.headers.get("Origin"));
      if (!origin) return buildUnauthorizedOriginResponse();

      // Rate limiting check
      const rateLimit = checkIpRateLimit(request, "/api/scrape");
      if (!rateLimit.allowed) {
        return corsResponse({
          body: JSON.stringify({
            error: "Rate limit exceeded",
            message: "Too many scrape requests. Please try again later.",
            retryAfter: Math.ceil((rateLimit.resetAt - Date.now()) / 1000),
          }),
          status: 429,
          origin,
        });
      }

      let rawPayload: unknown;
      try {
        rawPayload = await request.json();
      } catch (error) {
        console.error(
          "[ERROR] SCRAPE API INVALID JSON:",
          serializeError(error),
        );
        return corsResponse({
          body: JSON.stringify({
            error: "Invalid JSON body",
            errorDetails: serializeError(error),
          }),
          status: 400,
          origin,
        });
      }

      // Validate and normalize input
      const payload =
        rawPayload && typeof rawPayload === "object"
          ? (rawPayload as Record<string, unknown>)
          : null;
      if (!payload) {
        return corsResponse({
          body: JSON.stringify({ error: "Invalid request payload" }),
          status: 400,
          origin,
        });
      }
      const urlInput = (
        typeof payload.url === "string" ? payload.url : ""
      ).slice(0, 2048);

      const validation = validateScrapeUrl(urlInput);
      if (!validation.ok) {
        return corsResponse({
          body: JSON.stringify({ error: validation.error }),
          status: 400,
          origin,
        });
      }
      const url = validation.url;

      dlog("SCRAPE ENDPOINT CALLED:");
      dlog("URL:", url);

      try {
        const result = await ctx.runAction(api.search.scraperAction.scrapeUrl, {
          url,
        });

        dlog("SCRAPE RESULT:", JSON.stringify(result, null, 2));

        return corsResponse({
          body: JSON.stringify(result),
          status: 200,
          origin,
        });
      } catch (error) {
        const errorInfo = serializeError(error);
        const errorMessage = errorInfo.message;
        console.error("[ERROR] SCRAPE API ERROR:", {
          url: url.substring(0, 200),
          error: errorMessage,
          errorDetails: errorInfo,
          timestamp: new Date().toISOString(),
        });

        // URL is already validated by validateScrapeUrl — safe to parse
        const hostname = new URL(url).hostname;

        return corsResponse({
          body: JSON.stringify({
            error: "Scrape service failed",
            errorCode: "SCRAPE_FAILED",
            errorDetails: {
              url: url.substring(0, 200),
              hostname,
              timestamp: new Date().toISOString(),
            },
          }),
          status: 502,
          origin,
        });
      }
    }),
  });
}
