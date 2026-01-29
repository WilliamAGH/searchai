"use node";

/**
 * OpenRouter Search Provider
 * Uses Perplexity Sonar model for AI-powered web search
 */

import type { SearchResult, SearchProviderResult } from "../../schemas/search";
import { OpenRouterResponseSchema } from "../../schemas/search";
import { safeParseWithLog } from "../../lib/validation/zodUtils";
import { collectOpenRouterChatCompletionText } from "../../lib/providers/openai_streaming";

// Provider-specific relevance scores
// OpenRouter with Perplexity Sonar provides AI-curated results
const OPENROUTER_SCORES = {
  /** Annotated citations from Perplexity - high confidence, directly cited */
  ANNOTATED_CITATION: 0.85,
  /** URLs extracted via regex fallback - lower confidence, no verification */
  REGEX_EXTRACTED: 0.75,
} as const;

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
): Promise<SearchProviderResult> {
  const { text, completion } = await collectOpenRouterChatCompletionText({
    model: "perplexity/llama-3.1-sonar-small-128k-online",
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
  });

  const parseResult = safeParseWithLog(
    OpenRouterResponseSchema,
    completion,
    `OpenRouter [query=${query.substring(0, 50)}]`,
  );
  if (!parseResult.success) {
    // Per [EH1b]: Surface failures, don't swallow - throw with context
    throw new Error(
      `OpenRouter response validation failed for query "${query.substring(0, 50)}": ${parseResult.error.message}`,
    );
  }
  const data = parseResult.data;
  const content = text || data.choices?.[0]?.message?.content || "";
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
            content.substring(citation.start_index || 0, citation.end_index || 200),
          relevanceScore: OPENROUTER_SCORES.ANNOTATED_CITATION,
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
        relevanceScore: OPENROUTER_SCORES.REGEX_EXTRACTED,
      });
    });
  }

  return { results: results.slice(0, maxResults) };
}
