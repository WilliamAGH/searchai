/**
 * API Response Zod Schemas
 *
 * Single source of truth for external API response validation.
 * Types are derived via z.infer<> to eliminate redundant definitions.
 *
 * @see {@link ../validation/apiResponses.ts} - validation functions using these schemas
 */

import { z } from "zod/v4";

// ============================================
// Search Result Schema (Shared)
// ============================================

/**
 * Individual search result from external API.
 * Matches the SearchResult type from convex/lib/types/search.ts
 *
 * Note: relevanceScore defaults to 0.5 if not provided by the API,
 * since the SearchResult interface requires it.
 */
export const SearchResultSchema = z.object({
  title: z.string().max(500),
  url: z.string().max(2000),
  snippet: z.string().max(1000),
  relevanceScore: z.number().min(0).max(1).default(0.5),
});

export type SearchResultFromSchema = z.infer<typeof SearchResultSchema>;

// ============================================
// Search Response Schema
// ============================================

/**
 * Valid search methods returned by the API.
 */
export const SearchMethodSchema = z.enum([
  "serp",
  "openrouter",
  "duckduckgo",
  "fallback",
]);

export type SearchMethod = z.infer<typeof SearchMethodSchema>;

/**
 * Full search API response.
 */
export const SearchResponseSchema = z.object({
  results: z.array(SearchResultSchema),
  searchMethod: SearchMethodSchema,
  hasRealResults: z.boolean(),
  enrichment: z.unknown().optional(), // SerpEnrichment type is complex, keep as unknown
});

export type SearchResponseFromSchema = z.infer<typeof SearchResponseSchema>;

// ============================================
// AI Response Schema
// ============================================

/**
 * AI generation response from the API.
 */
export const AIResponseSchema = z.object({
  response: z.string(),
  reasoning: z.string().optional(),
});

export type AIResponseFromSchema = z.infer<typeof AIResponseSchema>;

// ============================================
// Share Response Schema
// ============================================

/**
 * Response from the chat publish/share endpoint.
 */
export const ShareResponseSchema = z.object({
  shareId: z.string().optional(),
  publicId: z.string().optional(),
  url: z.string().optional(),
});

/** ShareChatResponse type derived from Zod schema - single source of truth */
export type ShareChatResponse = z.infer<typeof ShareResponseSchema>;

/** @deprecated Use ShareChatResponse instead */
export type ShareResponseFromSchema = ShareChatResponse;

// ============================================
// Default Values
// ============================================

/**
 * Default search response when validation fails.
 */
export const DEFAULT_SEARCH_RESPONSE: SearchResponseFromSchema = {
  results: [],
  searchMethod: "fallback",
  hasRealResults: false,
};

/**
 * Default AI response when validation fails.
 */
export const DEFAULT_AI_RESPONSE: AIResponseFromSchema = {
  response: "Failed to generate response. Please try again.",
};
