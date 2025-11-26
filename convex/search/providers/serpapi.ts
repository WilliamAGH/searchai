/**
 * SERP API Search Provider
 * Uses Google search via SerpAPI for high-quality results
 */

import type {
  SearchResult,
  SearchProviderResult,
  SerpEnrichment,
} from "../../lib/types/search";
export type { SearchResult } from "../../lib/types/search";

interface SerpApiResponse {
  organic_results?: Array<{
    title?: string;
    link: string;
    snippet?: string;
    displayed_link?: string;
    position?: number;
  }>;
  knowledge_graph?: {
    title?: string;
    type?: string;
    description?: string;
    url?: string;
    attributes?: Record<string, string | undefined>;
  };
  answer_box?: {
    type?: string;
    answer?: string;
    snippet?: string;
    link?: string;
    title?: string;
  };
  people_also_ask?: Array<{
    question?: string;
    snippet?: string;
  }>;
  related_searches?: Array<{ query?: string }>;
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
  console.info("🔍 SERP API Request:", requestLog);

  try {
    const response = await fetch(apiUrl, {
      headers: {
        "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
      },
    });

    const safeLog = {
      status: response.status,
      statusText: response.statusText,
      ok: response.ok,
      endpoint: "https://serpapi.com/search.json",
      queryLength: query.length,
    } as const;
    console.info("📊 SERP API Response:", safeLog);

    if (!response.ok) {
      const errorText = await response.text();
      const errorMessage = `SERP API returned ${response.status} ${response.statusText}: ${errorText}`;
      console.error("❌ SERP API Error Details:", {
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
    console.info("✅ SERP API Success:", {
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
        enrichment.knowledgeGraph = {
          title: data.knowledge_graph.title,
          type: data.knowledge_graph.type,
          description: data.knowledge_graph.description,
          attributes: data.knowledge_graph.attributes
            ? (Object.fromEntries(
                Object.entries(data.knowledge_graph.attributes).filter(
                  ([, v]) => v !== undefined,
                ),
              ) as Record<string, string>)
            : undefined,
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

      console.info("📋 SERP API Results Parsed:", {
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

    console.log("⚠️ SERP API No Results:", {
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    return { results: [] };
  } catch (error) {
    console.error("💥 SERP API Exception:", {
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : "No stack trace",
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    throw error;
  }
}
