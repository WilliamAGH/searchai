/**
 * External API Response Validation
 *
 * Uses Zod schemas for runtime validation of external API responses.
 * Schemas are defined in ../schemas/apiResponses.ts (single source of truth).
 *
 * @see {@link ../schemas/apiResponses.ts} - Zod schemas
 */

import type { SearchResult } from "@/lib/types/message";
import {
  SearchResultSchema,
  SearchMethodSchema,
  AIResponseSchema,
  ShareResponseSchema,
  DEFAULT_AI_RESPONSE,
  type SearchMethod,
  SerpEnrichmentSchema,
  type SerpEnrichment,
} from "@/lib/schemas/apiResponses";

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/**
 * Default search response when validation fails.
 * Defined here with proper types (SerpEnrichment, not unknown).
 */
const DEFAULT_SEARCH_RESPONSE_TYPED: {
  results: SearchResult[];
  searchMethod: SearchMethod;
  hasRealResults: boolean;
  enrichment?: SerpEnrichment;
} = {
  results: [],
  searchMethod: "fallback",
  hasRealResults: false,
};

/**
 * Validate search API response.
 * Uses Zod schemas with custom transforms for length limits.
 */
export function validateSearchResponse(data: unknown): {
  results: SearchResult[];
  searchMethod: SearchMethod;
  hasRealResults: boolean;
  enrichment?: SerpEnrichment;
} {
  if (!data || typeof data !== "object") {
    return DEFAULT_SEARCH_RESPONSE_TYPED;
  }

  const response = isRecord(data) ? data : {};

  // Validate and sanitize results array with length limits
  const results: SearchResult[] = [];
  if (Array.isArray(response.results)) {
    for (const item of response.results) {
      const parsed = SearchResultSchema.safeParse(item);
      if (parsed.success) {
        results.push({
          title: parsed.data.title.substring(0, 500),
          url: parsed.data.url.substring(0, 2000),
          snippet: parsed.data.snippet.substring(0, 1000),
          // relevanceScore is guaranteed by schema default, clamp to 0-1
          relevanceScore: Math.max(0, Math.min(1, parsed.data.relevanceScore)),
        });
      }
    }
  }

  // Validate search method
  const methodResult = SearchMethodSchema.safeParse(response.searchMethod);
  const searchMethod = methodResult.success ? methodResult.data : "fallback";

  // Validate boolean
  const hasRealResults = response.hasRealResults === true;
  const enrichmentResult = SerpEnrichmentSchema.safeParse(response.enrichment);

  return {
    results,
    searchMethod,
    hasRealResults,
    enrichment: enrichmentResult.success ? enrichmentResult.data : undefined,
  };
}

/**
 * Validate AI generation response.
 * Uses Zod schema for structure validation.
 */
export function validateAIResponse(data: unknown): {
  response: string;
  reasoning?: string;
} {
  const result = AIResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  // Fallback: try to extract response field manually
  if (isRecord(data)) {
    if (typeof data.response === "string") {
      return {
        response: data.response,
        reasoning:
          typeof data.reasoning === "string" ? data.reasoning : undefined,
      };
    }
  }

  return DEFAULT_AI_RESPONSE;
}

/**
 * Validate share response from publish endpoint.
 * Uses Zod schema for structure validation.
 */
export function validateShareResponse(data: unknown): {
  shareId?: string;
  publicId?: string;
} {
  const result = ShareResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  return {};
}

// Re-export types and defaults for consumers
export type { SearchMethod };
export { DEFAULT_AI_RESPONSE };
