/**
 * OpenRouter Search Provider
 * Uses Perplexity Sonar model for AI-powered web search
 */

import type { SearchResult } from "./index";

interface OpenRouterResponse {
  choices?: Array<{
    message?: {
      content?: string;
      annotations?: Array<{
        type: string;
        url_citation?: {
          title?: string;
          url: string;
          content?: string;
          start_index?: number;
          end_index?: number;
        };
      }>;
    };
  }>;
}

/**
 * Search via OpenRouter model
 * - Uses Perplexity Sonar model
 * - Extracts URLs from annotations
 * - Falls back to regex extraction
 * - Relevance score: 0.75-0.85
 * @param query - Search query
 * @param maxResults - Max results to return
 * @returns Array of search results
 */
export async function searchWithOpenRouter(
  query: string,
  maxResults: number,
  apiKey: string,
): Promise<SearchResult[]> {
  // Preflight check for API key
  if (!apiKey) {
    throw new Error("OPENROUTER_API_KEY is not configured on the server");
  }

  // Add timeout for the fetch request
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 10000);

  const response = await fetch(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "perplexity/sonar",
        messages: [
          {
            role: "system",
            content:
              "You are a web search assistant. Provide factual information with sources. Always cite your sources with URLs.",
          },
          {
            role: "user",
            content: `Search for: ${query}. Provide key information with source URLs.`,
          },
        ],
        max_tokens: 1000,
        temperature: 0.1,
      }),
      signal: controller.signal,
    },
  );

  clearTimeout(timeoutId);

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(
      `OpenRouter API error: ${response.status} - ${errorText.substring(0, 200)}`,
    );
  }

  const data: OpenRouterResponse = await response.json();
  const content = data.choices?.[0]?.message?.content || "";
  const annotations = data.choices?.[0]?.message?.annotations || [];

  // Extract URLs from annotations if available
  const results: SearchResult[] = [];

  if (annotations.length > 0) {
    annotations.forEach((annotation, index) => {
      if (annotation.type === "url_citation" && annotation.url_citation) {
        const citation = annotation.url_citation;
        results.push({
          title: citation.title || `Search Result ${index + 1}`,
          url: citation.url,
          snippet:
            citation.content ||
            content.substring(
              citation.start_index || 0,
              citation.end_index || 200,
            ),
          relevanceScore: 0.85,
        });
      }
    });
  }

  // If no annotations, try to extract URLs from content
  if (results.length === 0 && content) {
    const urlRegex = /https?:\/\/[^\s)]+/g;
    const urls = content.match(urlRegex) || [];

    urls.slice(0, maxResults).forEach((url: string, index: number) => {
      results.push({
        title: `Search Result ${index + 1} for: ${query}`,
        url: url,
        snippet: `${content.substring(0, 200)}...`,
        relevanceScore: 0.75,
      });
    });
  }

  return results.slice(0, maxResults);
}
