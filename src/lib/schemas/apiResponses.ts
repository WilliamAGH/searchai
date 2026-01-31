/**
 * API Response Schemas
 *
 * Re-exports search schemas from canonical location and defines API-specific schemas.
 * Per [VL1]: Canonical Zod schemas live in convex/schemas/.
 *
 * @see {@link ../../../convex/schemas/search.ts} - canonical search schemas
 * @see {@link ../validation/apiResponses.ts} - validation functions
 */

import { z } from "zod/v4";

// ============================================
// Re-export from canonical location (no aliasing)
// ============================================

export {
  // Schemas
  SearchMethodSchema,
  SearchResultSchema,
  SerpEnrichmentSchema,
  SearchResponseSchema,
  // Types (same names as schemas, no Zod suffix)
  type SearchMethod,
  type SearchResult,
  type SerpEnrichment,
  type SearchResponse,
  // Constants
  DEFAULT_SEARCH_RESPONSE,
} from "../../../convex/schemas/search";

// ============================================
// AI Response Schema (API-specific)
// ============================================

export const AIResponseSchema = z.object({
  response: z.string(),
  reasoning: z.string().optional(),
});

export type AIResponse = z.infer<typeof AIResponseSchema>;

// ============================================
// Share Response Schema (API-specific)
// ============================================

export const ShareResponseSchema = z.object({
  shareId: z.string().optional(),
  publicId: z.string().optional(),
  url: z.string().optional(),
});

export type ShareChatResponse = z.infer<typeof ShareResponseSchema>;

// ============================================
// Default Values
// ============================================

export const DEFAULT_AI_RESPONSE: AIResponse = {
  response: "Failed to generate response. Please try again.",
};
