/**
 * Chat Type Definitions
 *
 * UI and data access use Convex Doc<"chats"> directly as the single path.
 */

import type { Doc } from "../../../convex/_generated/dataModel";

// Re-export ShareChatResponse from schema (single source of truth)
export type { ShareChatResponse } from "@/lib/schemas/apiResponses";

/**
 * Result of creating a new chat
 */
export interface CreateChatResult {
  chat: Doc<"chats">;
  isNew: boolean;
}

/**
 * Canonical chat type (single path).
 */
export type Chat = Doc<"chats">;
