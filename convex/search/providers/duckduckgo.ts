/**
 * DuckDuckGo Search Provider
 * Free, privacy-focused search fallback
 *
 * Note: This provider now includes optional content, fullTitle, and summary fields
 * in its SearchResult interface to match the schema expected by the messages system.
 * These fields are initialized as undefined and can be populated by the scraper.
 */

import type { SearchResult } from "./index";

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
 * - Uses instant answer API for context
 * - Filters out DuckDuckGo's category/disambiguation pages (/c/ and /d/)
 * - Supplements with web search suggestions
 * - Relevance score: 0.4-0.9
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
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

  // Extract instant answer results (including Wikipedia, etc.)
  if (data.Abstract && data.AbstractURL) {
    // Check if it's from a real external source (not DuckDuckGo itself)
    const isExternal = !data.AbstractURL.includes("duckduckgo.com");
    if (isExternal || results.length === 0) {
      results.push({
        title: data.Heading || query,
        url: data.AbstractURL,
        snippet: data.Abstract,
        relevanceScore: isExternal ? 0.9 : 0.5,
        content: undefined,
        fullTitle: undefined,
        summary: undefined,
      });
    }
  }

  // Extract related topics, preferring external URLs
  if (data.RelatedTopics && data.RelatedTopics.length > 0) {
    const topics = data.RelatedTopics.filter(
      (topic) =>
        topic.FirstURL && topic.Text && topic.FirstURL.startsWith("http"),
    )
      // Filter out DuckDuckGo category/disambiguation pages which just redirect
      .filter(
        (topic) =>
          !topic.FirstURL?.includes("duckduckgo.com/c/") &&
          !topic.FirstURL?.includes("duckduckgo.com/d/"),
      )
      .map((topic) => ({
        title:
          topic.Text?.split(" - ")[0] ||
          topic.Text?.substring(0, 100) ||
          "Untitled",
        url: topic.FirstURL || "",
        snippet: topic.Text || "",
        relevanceScore: 0.7, // All remaining URLs are external after filtering
        content: undefined,
        fullTitle: undefined,
        summary: undefined,
      }))
      // Sort by relevance score
      .sort((a, b) => b.relevanceScore - a.relevanceScore);

    // Add topics to results
    for (const topic of topics) {
      if (results.length >= maxResults) break;
      results.push(topic);
    }
  }

  // Add web search suggestions to ensure we get real results
  // These will be scraped and provide actual content
  const webSearchSuggestions: SearchResult[] = [
    {
      title: `${query} - Recent News & Information`,
      url: `https://news.google.com/search?q=${encodeURIComponent(query)}`,
      snippet: `Latest news and information about "${query}"`,
      relevanceScore: 0.75,
      content: undefined,
      fullTitle: undefined,
      summary: undefined,
    },
    {
      title: `${query} - Wikipedia`,
      url: `https://en.wikipedia.org/wiki/${encodeURIComponent(query.replace(/ /g, "_"))}`,
      snippet: `Wikipedia article about "${query}"`,
      relevanceScore: 0.8,
      content: undefined,
      fullTitle: undefined,
      summary: undefined,
    },
    {
      title: `${query} - Stack Overflow`,
      url: `https://stackoverflow.com/search?q=${encodeURIComponent(query)}`,
      snippet: `Technical discussions and solutions related to "${query}"`,
      relevanceScore: 0.65,
      content: undefined,
      fullTitle: undefined,
      summary: undefined,
    },
    {
      title: `${query} - GitHub`,
      url: `https://github.com/search?q=${encodeURIComponent(query)}`,
      snippet: `Open source projects and code related to "${query}"`,
      relevanceScore: 0.6,
      content: undefined,
      fullTitle: undefined,
      summary: undefined,
    },
    {
      title: `${query} - Reddit Discussion`,
      url: `https://www.reddit.com/search/?q=${encodeURIComponent(query)}`,
      snippet: `Community discussions about "${query}"`,
      relevanceScore: 0.55,
      content: undefined,
      fullTitle: undefined,
      summary: undefined,
    },
  ];

  // Intelligently select suggestions based on query type
  const queryLower = query.toLowerCase();
  let selectedSuggestions: SearchResult[] = [];

  // Technical queries get Stack Overflow and GitHub
  if (
    queryLower.match(
      /\b(code|programming|error|bug|api|function|javascript|python|react|node)\b/,
    )
  ) {
    selectedSuggestions = webSearchSuggestions.filter(
      (s) =>
        s.url.includes("stackoverflow.com") || s.url.includes("github.com"),
    );
  }
  // News/current events get Google News
  else if (queryLower.match(/\b(news|latest|recent|today|current|update)\b/)) {
    selectedSuggestions = webSearchSuggestions.filter((s) =>
      s.url.includes("news.google.com"),
    );
  }
  // General queries get Wikipedia and Reddit
  else {
    selectedSuggestions = webSearchSuggestions.filter(
      (s) => s.url.includes("wikipedia.org") || s.url.includes("reddit.com"),
    );
  }

  // Add selected suggestions to fill up to maxResults
  for (const suggestion of selectedSuggestions) {
    if (results.length >= maxResults) break;

    // Don't add duplicate domains
    const domain = new URL(suggestion.url).hostname;
    if (!results.some((r) => new URL(r.url).hostname === domain)) {
      results.push(suggestion);
    }
  }

  // If still no results, provide basic fallback
  if (results.length === 0) {
    results = [
      {
        title: `${query} - Web Search`,
        url: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
        snippet: `Search for "${query}" on the web`,
        relevanceScore: 0.5,
        content: undefined,
        fullTitle: undefined,
        summary: undefined,
      },
    ];
  }

  // Ensure we return up to maxResults
  return results.slice(0, maxResults);
}
