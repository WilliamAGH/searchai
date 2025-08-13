/**
 * SERP API Search Provider
 * Uses Google search via SerpAPI for high-quality results
 */

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}

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
export async function searchWithSerpApiDuckDuckGo(
  query: string,
  maxResults: number,
): Promise<SearchResult[]> {
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
        .map((result) => ({
          title: result.title || "Untitled",
          url: result.link,
          snippet: result.snippet || result.displayed_link || "",
          relevanceScore: 0.9,
        }));

      console.info("📋 SERP API Results Parsed:", {
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

    console.log("⚠️ SERP API No Results:", {
      queryLength: query.length,
      timestamp: new Date().toISOString(),
    });
    return [];
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
