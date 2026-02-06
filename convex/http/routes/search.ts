/**
 * Search route handlers
 * - OPTIONS and POST /api/search endpoints
 */

import { httpAction } from "../../_generated/server";
import { api } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog, serializeError } from "../utils";
import { corsPreflightResponse } from "../cors";
import { checkIpRateLimit } from "../../lib/rateLimit";
import { applyEnhancements, sortResultsWithPriority } from "../../enhancements";
import { normalizeUrlForKey } from "../../lib/url";

/**
 * Register search routes on the HTTP router
 */
export function registerSearchRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/search
  http.route({
    path: "/api/search",
    method: "OPTIONS",
    handler: httpAction(async (_ctx, request) => {
      return corsPreflightResponse(request);
    }),
  });

  // Web search endpoint for unauthenticated users
  http.route({
    path: "/api/search",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      const origin = request.headers.get("Origin");
      // Enforce strict origin validation early
      const probe = corsResponse({ body: "{}", status: 204, origin });
      if (probe.status === 403) return probe;

      // Rate limiting check
      const rateLimit = checkIpRateLimit(request, "/api/search");
      if (!rateLimit.allowed) {
        return corsResponse({
          body: JSON.stringify({
            error: "Rate limit exceeded",
            message: "Too many search requests. Please try again later.",
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
          "[ERROR] SEARCH API INVALID JSON:",
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
      const query = (
        typeof payload.query === "string" ? payload.query : ""
      ).slice(0, 1000);
      const maxResults =
        typeof payload.maxResults === "number"
          ? Math.max(1, Math.min(payload.maxResults, 50))
          : 5;

      if (!query.trim()) {
        return corsResponse({
          body: JSON.stringify({
            results: [],
            searchMethod: "fallback",
            hasRealResults: false,
          }),
          status: 200,
          origin,
        });
      }

      dlog("[SEARCH] SEARCH ENDPOINT CALLED:");
      dlog("Query:", query);
      dlog("Max Results:", maxResults);
      dlog("Environment Variables Available:");
      dlog("- SERP_API_KEY:", process.env.SERP_API_KEY ? "SET" : "NOT SET");
      dlog(
        "- OPENROUTER_API_KEY:",
        process.env.OPENROUTER_API_KEY ? "SET" : "NOT SET",
      );

      try {
        // Apply universal enhancements to anonymous search queries
        const enh = applyEnhancements(String(query), {
          enhanceQuery: true,
          enhanceSearchTerms: true,
          injectSearchResults: true,
          enhanceContext: true,
          enhanceSystemPrompt: true,
        });

        const enhancedQuery = enh.enhancedQuery || String(query);
        const prioritizedUrls = enh.prioritizedUrls || [];

        const result = await ctx.runAction(api.search.searchWeb, {
          query: enhancedQuery,
          maxResults: maxResults || 5,
        });

        // Inject any enhancement-provided results at the front then de-duplicate by normalized URL
        let mergedResults = Array.isArray(result.results)
          ? [...result.results]
          : [];
        if (enh.injectedResults && enh.injectedResults.length > 0) {
          mergedResults.unshift(...enh.injectedResults);
        }
        // Deduplicate by normalized URL, keep the entry with higher relevanceScore
        const byUrl = new Map<
          string,
          {
            title: string;
            url: string;
            snippet: string;
            relevanceScore?: number;
          }
        >();
        for (const r of mergedResults) {
          const key = normalizeUrlForKey(r.url);
          const prev = byUrl.get(key);
          const curScore =
            typeof r.relevanceScore === "number" ? r.relevanceScore : 0.5;
          const prevScore =
            typeof prev?.relevanceScore === "number"
              ? prev.relevanceScore
              : -Infinity;
          if (!prev || curScore > prevScore) byUrl.set(key, r);
        }
        mergedResults = Array.from(byUrl.values()).map((r) => ({
          ...r,
          relevanceScore: r.relevanceScore ?? 0.5,
        }));
        // If prioritization hints exist, sort with priority
        if (prioritizedUrls.length > 0 && mergedResults.length > 1) {
          mergedResults = sortResultsWithPriority(
            mergedResults,
            prioritizedUrls,
          );
        }

        const enhancedResult = {
          ...result,
          results: mergedResults,
          hasRealResults:
            result.hasRealResults || (mergedResults?.length ?? 0) > 0,
          // Surface matched rules for debugging in dev if needed (non-breaking)
        } as const;

        dlog(
          "[SEARCH] SEARCH RESULT:",
          JSON.stringify(enhancedResult, null, 2),
        );

        return corsResponse({
          body: JSON.stringify(enhancedResult),
          status: 200,
          origin,
        });
      } catch (error) {
        const errorInfo = serializeError(error);
        const errorMessage = errorInfo.message;
        console.error("[ERROR] SEARCH API ERROR:", {
          query: query.substring(0, 100),
          error: errorMessage,
          errorDetails: errorInfo,
          timestamp: new Date().toISOString(),
        });

        const errorResponse = {
          error: "Search service temporarily unavailable",
          errorCode: "SEARCH_FAILED",
          errorDetails: {
            ...errorInfo,
            timestamp: new Date().toISOString(),
          },
          // Include fallback results for graceful degradation, but with 500 status
          results: [
            {
              title: `Search for: ${query}`,
              url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
              snippet:
                "Search results temporarily unavailable. Click to search manually.",
              relevanceScore: 0.3,
            },
          ],
          searchMethod: "fallback",
          hasRealResults: false,
        };

        dlog(
          "[SEARCH] SEARCH ERROR RESPONSE:",
          JSON.stringify(errorResponse, null, 2),
        );

        // Return 500 to indicate server error - clients can still use fallback results
        return corsResponse({
          body: JSON.stringify(errorResponse),
          status: 500,
          origin,
        });
      }
    }),
  });
}
