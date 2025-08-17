/**
 * SERP API Search Provider
 * Uses Google search via SerpAPI for high-quality results
 */

import { logger } from "../../lib/logger";
import type { SearchResult } from "./index";

interface SerpApiResponse {
  organic_results?: Array<{
    title?: string;
    link: string;
    snippet?: string;
    displayed_link?: string;
  }>;
}

/**
 * Query SerpAPI (Google engine)
 * - Fetches organic results
 * - Returns normalized SearchResult[]
 * - Detailed error logging
 * - Relevance score: 0.9
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithSerpApi(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  // Validate API key exists
  if (!apiKey) {
    logger.error("❌ SERP_API_KEY not configured");
    throw new Error("SERP_API_KEY is not configured on the server");
  }

  const apiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${apiKey}&hl=en&gl=us&num=${maxResults}`;
  const requestLog = {
    queryLength: query.length,
    maxResults,
    timestamp: new Date().toISOString(),
  };
  logger.info("🔍 SERP API Request:", requestLog);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
      },
      signal: AbortSignal.timeout(10000), // 10 second timeout
    });

    const safeLog = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      endpoint: "https://serpapi.com/search.json",
      queryLength: query.length,
    } as const;
    logger.info("📊 SERP API Response:", safeLog);

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `SERP API returned ${response.status} ${response.statusText}: ${errorText}`;
      logger.error("❌ SERP API Error Details:", {
        status: response.status,
        statusText: response.statusText,
        errorText,
        queryLength: query.length,
        maxResults,
        timestamp: new Date().toISOString(),
      });
      throw new Error(errorMessage);
    }

    const data: SerpApiResponse = await response.json();
    logger.info("✅ SERP API Success:", {
      hasOrganic: !!data.organic_results,
      count: data.organic_results?.length || 0,
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });

    if (data.organic_results && data.organic_results.length > 0) {
      const results: SearchResult[] = data.organic_results
        .slice(0, maxResults)
        .map((result) => ({
          title: result.title || "Untitled",
          url: result.link,
          snippet: result.snippet || result.displayed_link || "",
          relevanceScore: 0.9,
        }));

      logger.info("📋 SERP API Results Parsed:", {
        resultCount: results.length,
        sampleResults: results.slice(0, 2).map((r) => ({
          title: r.title,
          url: r.url,
          snippetLength: r.snippet?.length || 0,
        })),
        timestamp: new Date().toISOString(),
      });

      return results;
    }

    logger.debug("⚠️ SERP API No Results:", {
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    return [];
  } catch (error) {
    logger.error("💥 SERP API Exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
