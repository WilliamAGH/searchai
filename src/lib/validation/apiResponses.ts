/**
 * External API Response Validation
 *
 * Uses Zod schemas for runtime validation of external API responses.
 * Schemas are defined in ../schemas/apiResponses.ts (single source of truth).
 * Validation utilities from convex/lib/validation/zodUtils.ts (canonical).
 *
 * Per [ZV1]: Uses logZodFailure for error surfacing - no silent failures.
 * Per [VL1]: Frontend does NOT re-validate data already validated by Convex.
 *
 * @see {@link ../schemas/apiResponses.ts} - Zod schemas
 * @see {@link ../../../convex/lib/validation/zodUtils.ts} - Validation utilities
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
import {
  logZodFailure,
  isRecord,
  parseArrayWithLogging,
} from "../../../convex/lib/validation/zodUtils";

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
 * Per [ZV1c]: Logs individual item failures with index.
 */
export function validateSearchResponse(data: unknown): {
  results: SearchResult[];
  searchMethod: SearchMethod;
  hasRealResults: boolean;
  enrichment?: SerpEnrichment;
} {
  if (!data || typeof data !== "object") {
    logZodFailure("validateSearchResponse", new Error("Invalid data type"), data);
    return DEFAULT_SEARCH_RESPONSE_TYPED;
  }

  const response = isRecord(data) ? data : {};

  // Validate and sanitize results array with length limits
  // Per [ZV1c]: parseArrayWithLogging logs each failure with index
  const rawResults = Array.isArray(response.results) ? response.results : [];
  const validatedResults = parseArrayWithLogging(
    SearchResultSchema,
    rawResults,
    "validateSearchResponse.results",
  );

  // Apply length limits (schema validates structure, we enforce limits)
  const results: SearchResult[] = validatedResults.map((r) => ({
    title: r.title.substring(0, 500),
    url: r.url.substring(0, 2000),
    snippet: r.snippet.substring(0, 1000),
    // relevanceScore is guaranteed by schema default, clamp to 0-1
    relevanceScore: Math.max(0, Math.min(1, r.relevanceScore)),
  }));

  // Validate search method
  const methodResult = SearchMethodSchema.safeParse(response.searchMethod);
  if (!methodResult.success) {
    logZodFailure("validateSearchResponse.searchMethod", methodResult.error, response.searchMethod);
  }
  const searchMethod = methodResult.success ? methodResult.data : "fallback";

  // Validate boolean
  const hasRealResults = response.hasRealResults === true;

  // Validate enrichment
  const enrichmentResult = SerpEnrichmentSchema.safeParse(response.enrichment);
  if (!enrichmentResult.success && response.enrichment !== undefined) {
    logZodFailure("validateSearchResponse.enrichment", enrichmentResult.error, response.enrichment);
  }

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
 * Per [ZV1]: Logs failures before returning defaults.
 */
export function validateAIResponse(data: unknown): {
  response: string;
  reasoning?: string;
} {
  const result = AIResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }

  logZodFailure("validateAIResponse", result.error, data);

  // Fallback: try to extract response field manually
  if (isRecord(data)) {
    if (typeof data.response === "string") {
      return {
        response: data.response,
        reasoning: typeof data.reasoning === "string" ? data.reasoning : undefined,
      };
    }
  }

  return DEFAULT_AI_RESPONSE;
}

/**
 * Validate share response from publish endpoint.
 * Uses Zod schema for structure validation.
 * Per [ZV1]: Logs failures before returning empty object.
 */
export function validateShareResponse(data: unknown): {
  shareId?: string;
  publicId?: string;
} {
  const result = ShareResponseSchema.safeParse(data);
  if (result.success) {
    return result.data;
  }
  logZodFailure("validateShareResponse", result.error, data);
  return {};
}

// Re-export types and defaults for consumers
export type { SearchMethod };
export { DEFAULT_AI_RESPONSE };
