/**
 * Centralized Zod Schemas
 *
 * Re-exports all schemas from a single entry point.
 * Use Zod v4 import syntax: import { z } from "zod/v4"
 *
 * @example
 * ```ts
 * import { LocalChat, LocalMessage, ShareChatResponse } from "@/lib/schemas";
 * ```
 */

// localStorage schemas
export {
  LocalChatSchema,
  LocalMessageSchema,
  parseLocalChat,
  parseLocalMessage,
  type LocalChat,
  type LocalMessage,
  // Deprecated aliases for backward compatibility
  type LocalChatFromSchema,
  type LocalMessageFromSchema,
} from "./localStorage";

// API response schemas
export {
  SearchResultSchema,
  SearchMethodSchema,
  SearchResponseSchema,
  AIResponseSchema,
  ShareResponseSchema,
  DEFAULT_SEARCH_RESPONSE,
  DEFAULT_AI_RESPONSE,
  type SearchResultFromSchema,
  type SearchMethod,
  type SearchResponseFromSchema,
  type AIResponseFromSchema,
  type ShareChatResponse,
  // Deprecated alias
  type ShareResponseFromSchema,
} from "./apiResponses";
