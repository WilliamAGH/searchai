/**
 * Search route handlers
 * - OPTIONS and POST /api/search endpoints
 */

"use node";
import { httpAction } from "../../_generated/server";
import { api, internal } from "../../_generated/api";
import type { HttpRouter } from "convex/server";
import { corsResponse, dlog } from "../utils";
import { applyEnhancements, sortResultsWithPriority } from "../../enhancements";
import { normalizeUrlForKey } from "../../lib/url";
import {
  getClientIP,
  createRateLimitedResponse,
} from "../../lib/security/rateLimit";

/**
 * Register search routes on the HTTP router
 */
export function registerSearchRoutes(http: HttpRouter) {
  // CORS preflight handler for /api/search
  http.route({
    path: "/api/search",
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

  // Web search endpoint for unauthenticated users
  http.route({
    path: "/api/search",
    method: "POST",
    handler: httpAction(async (ctx, request) => {
      // Rate limiting
      const clientIP = getClientIP(request);
      const rateLimitKey = `rate_limit:${clientIP}:search`;
      // Type assertion to avoid TS2589 deep instantiation error
      // This is a known Convex limitation with deeply nested types
      // @ts-expect-error - TS2589: Type instantiation is excessively deep
      const rateLimitMutation = internal.rateLimits.bumpAndCheck as any;
      const rateLimitResult = (await ctx.runMutation(rateLimitMutation, {
        key: rateLimitKey,
        maxRequests: 10,
        windowMs: 60000, // 1 minute
      })) as {
        isRateLimited: boolean;
        rateLimitHeaders: Record<string, string>;
      };

      if (rateLimitResult.isRateLimited) {
        return createRateLimitedResponse(
          "Rate limit exceeded for search endpoint",
          rateLimitResult.rateLimitHeaders,
        );
      }

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
      const query = String(payload.query || "").slice(0, 1000);
      const maxResults =
        typeof payload.maxResults === "number"
          ? Math.max(1, Math.min(payload.maxResults, 50))
          : 5;

      if (!query.trim()) {
        return corsResponse(
          JSON.stringify({
            results: [],
            searchMethod: "fallback",
            hasRealResults: false,
          }),
        );
      }

      dlog("🔍 SEARCH ENDPOINT CALLED:");
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

        dlog("🔍 SEARCH RESULT:", JSON.stringify(enhancedResult, null, 2));

        return corsResponse(JSON.stringify(enhancedResult));
      } catch (error) {
        console.error("❌ SEARCH API ERROR:", error);

        // Create fallback search results
        const fallbackResults = [
          {
            title: `Search for: ${query}`,
            url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
            snippet:
              "Search results temporarily unavailable. Click to search manually.",
            relevanceScore: 0.3,
          },
        ];

        const errorResponse = {
          results: fallbackResults,
          searchMethod: "fallback",
          hasRealResults: false,
          error: "Search failed",
          errorDetails: {
            timestamp: new Date().toISOString(),
          },
        };

        dlog(
          "🔍 SEARCH FALLBACK RESPONSE:",
          JSON.stringify(errorResponse, null, 2),
        );

        return corsResponse(JSON.stringify(errorResponse));
      }
    }),
  });
}
