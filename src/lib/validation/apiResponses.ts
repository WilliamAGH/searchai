/**
 * External API Response Validation
 * For non-Convex API responses (search, AI generation, etc.)
 * These APIs don't use Convex validators, so we need runtime validation
 */

import type { SearchResult } from "../types/message";

/**
 * Validate search API response
 */
export function validateSearchResponse(data: unknown): {
  results: SearchResult[];
  searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults: boolean;
} {
  if (!data || typeof data !== "object") {
    return {
      results: [],
      searchMethod: "fallback",
      hasRealResults: false,
    };
  }

  const response = data as Record<string, unknown>;

  // Validate and sanitize results array
  const results: SearchResult[] = [];
  if (Array.isArray(response.results)) {
    for (const item of response.results) {
      if (
        item &&
        typeof item === "object" &&
        typeof item.title === "string" &&
        typeof item.url === "string" &&
        typeof item.snippet === "string"
      ) {
        results.push({
          title: item.title.substring(0, 500), // Limit length
          url: item.url.substring(0, 2000),
          snippet: item.snippet.substring(0, 1000),
          relevanceScore:
            typeof item.relevanceScore === "number"
              ? Math.max(0, Math.min(1, item.relevanceScore)) // Clamp 0-1
              : undefined,
        });
      }
    }
  }

  // Validate search method
  const validMethods = [
    "serp",
    "openrouter",
    "duckduckgo",
    "fallback",
  ] as const;
  const searchMethod = validMethods.includes(response.searchMethod)
    ? response.searchMethod
    : "fallback";

  // Validate boolean
  const hasRealResults = response.hasRealResults === true;

  return {
    results,
    searchMethod,
    hasRealResults,
  };
}

/**
 * Validate AI generation response
 */
export function validateAIResponse(data: unknown): {
  response: string;
  reasoning?: string;
} {
  if (!data || typeof data !== "object") {
    return {
      response: "Failed to generate response. Please try again.",
    };
  }

  const aiData = data as Record<string, unknown>;

  return {
    response:
      typeof aiData.response === "string"
        ? aiData.response
        : "Failed to generate response. Please try again.",
    reasoning:
      typeof aiData.reasoning === "string" ? aiData.reasoning : undefined,
  };
}

/**
 * Validate streaming chunk from SSE
 */
export function validateStreamChunk(data: string): {
  type: "chunk" | "done" | "error";
  content?: string;
  thinking?: string;
  error?: string;
} | null {
  try {
    const chunk = JSON.parse(data);

    if (!chunk || typeof chunk !== "object") return null;

    // Validate chunk type
    if (!["chunk", "done", "error"].includes(chunk.type)) return null;

    return {
      type: chunk.type,
      content: typeof chunk.content === "string" ? chunk.content : undefined,
      thinking: typeof chunk.thinking === "string" ? chunk.thinking : undefined,
      error: typeof chunk.error === "string" ? chunk.error : undefined,
    };
  } catch {
    return null;
  }
}

/**
 * Validate share response from publish endpoint
 */
export function validateShareResponse(data: unknown): {
  shareId?: string;
  publicId?: string;
} {
  if (!data || typeof data !== "object") {
    return {};
  }

  const response = data as Record<string, unknown>;

  return {
    shareId:
      typeof response.shareId === "string" ? response.shareId : undefined,
    publicId:
      typeof response.publicId === "string" ? response.publicId : undefined,
  };
}
