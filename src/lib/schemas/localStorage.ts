/**
 * localStorage Zod Schemas
 *
 * Single source of truth for client-side localStorage data validation.
 * Types are derived via z.infer<> to eliminate redundant definitions.
 *
 * @see {@link ../validation/localStorage.ts} - validation functions using these schemas
 */

import { z } from "zod/v4";

// ============================================
// LocalChat Schema
// ============================================

/**
 * Schema for chat data stored in localStorage.
 * Mirrors Convex structure for seamless migration to server.
 */
export const LocalChatSchema = z.object({
  _id: z.string().regex(/^local_/, "Local chat ID must start with 'local_'"),
  title: z.string(),
  createdAt: z.number(),
  updatedAt: z.number(),
  privacy: z.enum(["private", "shared", "public"]),
  shareId: z.string().optional(),
  publicId: z.string().optional(),
  rollingSummary: z.string().optional(),
  rollingSummaryUpdatedAt: z.number().optional(),

  // Local-only metadata (required for localStorage chats)
  isLocal: z.literal(true),
  source: z.literal("local"),
});

/** LocalChat type derived from Zod schema - single source of truth */
export type LocalChat = z.infer<typeof LocalChatSchema>;

// ============================================
// SearchResult Schema (for LocalMessage)
// ============================================

/**
 * Search result schema matching convex/lib/types/search.ts SearchResult.
 * Used within LocalMessage for localStorage validation.
 */
const LocalSearchResultSchema = z.object({
  title: z.string(),
  url: z.string(),
  snippet: z.string(),
  relevanceScore: z.number(),
  fullTitle: z.string().optional(),
  summary: z.string().optional(),
  content: z.string().optional(),
  kind: z.enum(["search_result", "scraped_page"]).optional(),
});

// ============================================
// LocalMessage Schema
// ============================================

/**
 * Schema for message data stored in localStorage.
 * Mirrors Convex structure for seamless migration to server.
 */
export const LocalMessageSchema = z.object({
  _id: z.string(),
  chatId: z.string(),
  role: z.enum(["user", "assistant", "system"]),
  content: z.string().optional(),
  timestamp: z.number().optional(),

  // Search and AI metadata (matching Convex schema)
  searchResults: z.array(LocalSearchResultSchema).optional(),
  sources: z.array(z.string()).optional(),
  reasoning: z.string().optional(),
  searchMethod: z
    .enum(["serp", "openrouter", "duckduckgo", "fallback"])
    .optional(),
  hasRealResults: z.boolean().optional(),
  isStreaming: z.boolean().optional(),
  streamedContent: z.string().optional(),
  thinking: z.string().optional(),

  // Local-only metadata (required for localStorage messages)
  isLocal: z.literal(true),
  source: z.literal("local"),
  hasStartedContent: z.boolean().optional(),
});

/** LocalMessage type derived from Zod schema - single source of truth */
export type LocalMessage = z.infer<typeof LocalMessageSchema>;

// ============================================
// Parsing Utilities
// ============================================

/**
 * Safely parse a single chat object from localStorage.
 * Returns undefined if validation fails.
 */
export function parseLocalChat(data: unknown): LocalChat | undefined {
  const result = LocalChatSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Safely parse a single message object from localStorage.
 * Returns undefined if validation fails.
 */
export function parseLocalMessage(data: unknown): LocalMessage | undefined {
  const result = LocalMessageSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

// ============================================
// Backward Compatibility Aliases
// ============================================
// These aliases support gradual migration from the old naming convention

/** @deprecated Use LocalChat instead */
export type LocalChatFromSchema = LocalChat;

/** @deprecated Use LocalMessage instead */
export type LocalMessageFromSchema = LocalMessage;
