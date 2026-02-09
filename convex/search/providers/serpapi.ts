/**
 * SERP API Search Provider
 * Uses Google search via SerpAPI for high-quality results
 */

import type {
  SearchResult,
  SearchProviderResult,
  SerpEnrichment,
} from "../../schemas/search";
import { SerpApiResponseSchema } from "../../schemas/search";
import { safeParseWithLog } from "../../lib/validation/zodUtils";
import { getErrorMessage } from "../../lib/errors";
export type { SearchResult } from "../../schemas/search";

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
export async function searchWithSerpApiDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchProviderResult> {
  const apiUrl = `https://serpapi.com/search.json?engine=google&q=${encodeURIComponent(query)}&api_key=${process.env.SERP_API_KEY}&hl=en&gl=us&num=${maxResults}`;
  const requestLog = {
    queryLength: query.length,
    maxResults,
    timestamp: new Date().toISOString(),
  };
  console.info("[SEARCH] SERP API Request:", requestLog);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
      },
      signal: AbortSignal.timeout(30000), // 30 second timeout
    });

    const safeLog = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      endpoint: "https://serpapi.com/search.json",
      queryLength: query.length,
    } as const;
    console.info("SERP API Response:", safeLog);

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `SERP API returned ${response.status} ${response.statusText}: ${errorText}`;
      console.error("[ERROR] SERP API Error Details:", {
        status: response.status,
        statusText: response.statusText,
        errorText,
        queryLength: query.length,
        maxResults,
        timestamp: new Date().toISOString(),
      });
      throw new Error(errorMessage);
    }

    const rawData: unknown = await response.json();
    const parseResult = safeParseWithLog(
      SerpApiResponseSchema,
      rawData,
      `SerpAPI [query=${query.substring(0, 50)}]`,
    );
    if (!parseResult.success) {
      // Per [EH1b]: Surface failures, don't swallow - throw with context
      throw new Error(
        `SerpAPI response validation failed for query "${query.substring(0, 50)}": ${parseResult.error.message}`,
      );
    }
    const data = parseResult.data;
    console.info("[OK] SERP API Success:", {
      hasOrganic: !!data.organic_results,
      count: data.organic_results?.length || 0,
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });

    if (data.organic_results && data.organic_results.length > 0) {
      const results: SearchResult[] = data.organic_results
        .slice(0, maxResults)
        .map((result, index) => ({
          title: result.title || "Untitled",
          url: result.link,
          snippet: result.snippet || result.displayed_link || "",
          relevanceScore: Math.max(0, 1 - index * 0.05),
        }));

      const enrichment: SerpEnrichment = {};

      if (data.knowledge_graph) {
        let attributes: Record<string, string> | undefined;
        if (data.knowledge_graph.attributes) {
          const filteredEntries = Object.entries(
            data.knowledge_graph.attributes,
          ).filter((entry): entry is [string, string] => {
            const [, value] = entry;
            return typeof value === "string";
          });
          if (filteredEntries.length > 0) {
            attributes = Object.fromEntries(filteredEntries);
          }
        }

        enrichment.knowledgeGraph = {
          title: data.knowledge_graph.title,
          type: data.knowledge_graph.type,
          description: data.knowledge_graph.description,
          attributes,
          url: data.knowledge_graph.url,
        };
      }

      if (data.answer_box) {
        enrichment.answerBox = {
          type: data.answer_box.type,
          answer: data.answer_box.answer || data.answer_box.snippet,
          snippet: data.answer_box.snippet,
          source: data.answer_box.title,
          url: data.answer_box.link,
        };
      }

      if (data.people_also_ask?.length) {
        enrichment.peopleAlsoAsk = data.people_also_ask
          .filter((p) => p.question)
          .map((p) => ({
            question: p.question ?? "",
            snippet: p.snippet ?? undefined,
          }));
      }

      if (data.related_searches?.length) {
        enrichment.relatedSearches = data.related_searches
          .map((r) => r.query)
          .filter((q): q is string => typeof q === "string" && q.length > 0);
      }

      console.info("SERP API Results Parsed:", {
        resultCount: results.length,
        sampleResults: results.slice(0, 2).map((r) => ({
          title: r.title,
          url: r.url,
          snippetLength: r.snippet?.length || 0,
        })),
        hasEnrichment: Boolean(
          enrichment.knowledgeGraph ||
          enrichment.answerBox ||
          enrichment.peopleAlsoAsk?.length ||
          enrichment.relatedSearches?.length,
        ),
        timestamp: new Date().toISOString(),
      });

      return { results, enrichment };
    }

    console.warn("[WARN] SERP API No Results:", {
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    return { results: [] };
  } catch (error) {
    console.error("[ERROR] SERP API Exception:", {
      error: getErrorMessage(error),
      stack: error instanceof Error ? error.stack : "No stack trace",
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
