/**
 * DuckDuckGo Search Provider
 * Free, privacy-focused search fallback
 */

import type {
  SearchResult,
  SearchProviderResult,
} from "../../lib/types/search";

// Provider-specific relevance scores
// DuckDuckGo instant answer API returns varying quality data
const DUCKDUCKGO_SCORES = {
  /** Abstract/summary from authoritative source - highest confidence */
  ABSTRACT: 0.8,
  /** Related topics - curated but less direct */
  RELATED_TOPIC: 0.7,
  /** Wikipedia fallback - reliable but generic */
  WIKIPEDIA_FALLBACK: 0.6,
  /** DDG search link fallback - lowest, just a redirect */
  SEARCH_FALLBACK: 0.4,
} as const;

interface DuckDuckGoResponse {
  RelatedTopics?: Array<{
    FirstURL?: string;
    Text?: string;
  }>;
  Abstract?: string;
  AbstractURL?: string;
  Heading?: string;
}

/**
 * Search via DuckDuckGo API
 * - Uses instant answer API
 * - Extracts RelatedTopics/Abstract
 * - Fallback to Wikipedia/DDG links
 * - Relevance score: 0.4-0.8
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchProviderResult> {
  const searchUrl = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
  const response = await fetch(searchUrl, {
    headers: {
      "User-Agent": "SearchChat/1.0 (Web Search Assistant)",
    },
  });

  if (!response.ok) {
    throw new Error(`DuckDuckGo API returned ${response.status}`);
  }

  const data: DuckDuckGoResponse = await response.json();
  let results: SearchResult[] = [];

  // Extract results from DuckDuckGo response
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    results = data.RelatedTopics.filter(
      (topic) =>
        topic.FirstURL && topic.Text && topic.FirstURL.startsWith("http"),
    )
      .slice(0, maxResults)
      .map((topic) => ({
        title:
          topic.Text?.split(" - ")[0] ||
          topic.Text?.substring(0, 100) ||
          "Untitled",
        url: topic.FirstURL || "",
        snippet: topic.Text || "",
        relevanceScore: DUCKDUCKGO_SCORES.RELATED_TOPIC,
      }));
  }

  // If no results from RelatedTopics, try Abstract
  if (results.length === 0 && data.Abstract && data.AbstractURL) {
    results = [
      {
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.Abstract,
        relevanceScore: DUCKDUCKGO_SCORES.ABSTRACT,
      },
    ];
  }

  // Enhanced fallback with better search URLs
  if (results.length === 0) {
    const fallbackSources: SearchResult[] = [
      {
        title: `${query} - Wikipedia`,
        url: `https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(query)}`,
        snippet: `Wikipedia search results for "${query}"`,
        relevanceScore: DUCKDUCKGO_SCORES.WIKIPEDIA_FALLBACK,
      },
      {
        title: `${query} - Search Results`,
        url: `https://duckduckgo.com/?q=${encodeURIComponent(query)}`,
        snippet: `Web search results for "${query}"`,
        relevanceScore: DUCKDUCKGO_SCORES.SEARCH_FALLBACK,
      },
    ];

    results = fallbackSources.slice(0, Math.min(2, maxResults));
  }

  return { results };
}
