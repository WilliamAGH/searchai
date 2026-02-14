/**
 * API Response Schemas
 *
 * Defines API-specific schemas for AI and share responses.
 * Search schemas live in convex/schemas/search.ts — import directly from there.
 *
 * @see {@link ../../../convex/schemas/search.ts} - canonical search schemas
 * @see {@link ../validation/apiResponses.ts} - validation functions
 */

import { z } from "zod/v4";

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
