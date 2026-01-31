"use node";

import { getErrorMessage } from "../lib/errors";
import { searchWithOpenRouter } from "./providers/openrouter";
import { searchWithSerpApiDuckDuckGo } from "./providers/serpapi";
import { searchWithDuckDuckGo } from "./providers/duckduckgo";
import { getCachedSearchResults, setCachedSearchResults } from "./cache";

export async function runSearchWeb(args: {
  query: string;
  maxResults?: number;
}) {
  const maxResults = args.maxResults || 5;
  const trimmedQuery = args.query.trim();

  if (trimmedQuery.length === 0) {
    return {
      results: [],
      searchMethod: "fallback" as const,
      hasRealResults: false,
      enrichment: undefined,
    };
  }

  // Check cache first
  const cacheKey = `search:${trimmedQuery}:${maxResults}`;
  const cached = getCachedSearchResults(cacheKey);

  if (cached) {
    return cached;
  }

  // Track provider errors for diagnostics
  const providerErrors: Array<{ provider: string; error: string }> = [];

  // Try SERP API for DuckDuckGo first if available
  if (process.env.SERP_API_KEY) {
    try {
      const serpResults = await searchWithSerpApiDuckDuckGo(
        args.query,
        maxResults,
      );
      if (serpResults.results.length > 0) {
        const result = {
          results: serpResults.results,
          searchMethod: "serp" as const,
          hasRealResults: true,
          enrichment: serpResults.enrichment,
        };
        // Cache the successful result
        setCachedSearchResults(cacheKey, result);
        return result;
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.warn("SERP API failed:", {
        error: errorMsg,
        query: args.query,
      });
      providerErrors.push({ provider: "serp", error: errorMsg });
    }
  }

  // Try OpenRouter web search as fallback
  if (process.env.OPENROUTER_API_KEY) {
    try {
      const openRouterResults = await searchWithOpenRouter(
        args.query,
        maxResults,
      );
      if (openRouterResults.results.length > 0) {
        return {
          results: openRouterResults.results,
          searchMethod: "openrouter" as const,
          hasRealResults: true,
          enrichment: openRouterResults.enrichment,
        };
      }
    } catch (error) {
      const errorMsg = getErrorMessage(error);
      console.warn("OpenRouter search failed:", {
        error: errorMsg,
        query: args.query,
      });
      providerErrors.push({ provider: "openrouter", error: errorMsg });
    }
  }

  // Try DuckDuckGo direct API as backup
  try {
    const ddgResults = await searchWithDuckDuckGo(args.query, maxResults);
    if (ddgResults.results.length > 0) {
      return {
        results: ddgResults.results,
        searchMethod: "duckduckgo" as const,
        hasRealResults: ddgResults.results.some(
          (r) => (r.relevanceScore ?? 0) > 0.6,
        ),
        enrichment: ddgResults.enrichment,
      };
    }
  } catch (error) {
    const errorMsg = getErrorMessage(error);
    console.warn("DuckDuckGo search failed:", {
      error: errorMsg,
      query: args.query,
    });
    providerErrors.push({ provider: "duckduckgo", error: errorMsg });
  }

  // Final fallback - return minimal search links with error context
  const fallbackResults = [
    {
      title: `Search for: ${args.query}`,
      url: `https://duckduckgo.com/?q=${encodeURIComponent(args.query)}`,
      snippet:
        "Search results temporarily unavailable. Click to search manually.",
      relevanceScore: 0.3,
    },
  ];

  // Log when all providers failed for monitoring
  if (providerErrors.length > 0) {
    console.error("All search providers failed:", {
      query: args.query.substring(0, 100),
      errors: providerErrors,
      timestamp: new Date().toISOString(),
    });
  }

  return {
    results: fallbackResults,
    searchMethod: "fallback" as const,
    hasRealResults: false,
    enrichment: undefined,
    providerErrors: providerErrors.length > 0 ? providerErrors : undefined,
    allProvidersFailed: providerErrors.length > 0,
  };
}
