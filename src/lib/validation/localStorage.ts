/**
 * localStorage Validation
 *
 * Uses Zod schemas for runtime validation of localStorage data.
 * Schemas are defined in ../schemas/localStorage.ts (single source of truth).
 *
 * @see {@link ../schemas/localStorage.ts} - Zod schemas
 */

import type { LocalChat, LocalMessage } from "../schemas/localStorage";
import { logger } from "../logger";
import { LocalChatSchema, LocalMessageSchema } from "../schemas/localStorage";

/**
 * Validate localStorage chat data.
 * Returns validated data or undefined if invalid.
 */
export function validateLocalChat(data: unknown): LocalChat | undefined {
  const result = LocalChatSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Validate localStorage message data.
 * Returns validated data or undefined if invalid.
 */
export function validateLocalMessage(data: unknown): LocalMessage | undefined {
  const result = LocalMessageSchema.safeParse(data);
  return result.success ? result.data : undefined;
}

/**
 * Safely parse JSON from localStorage.
 * Returns validated array or empty array on error.
 */
export function parseLocalChats(json: string): LocalChat[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(validateLocalChat)
      .filter((chat): chat is LocalChat => chat !== undefined);
  } catch (error) {
    logger.error("Failed to parse localStorage chats JSON", {
      error,
      length: json.length,
      preview: json.slice(0, 200),
    });
    return [];
  }
}

/**
 * Safely parse messages from localStorage.
 * Returns validated array or empty array on error.
 */
export function parseLocalMessages(json: string): LocalMessage[] {
  try {
    const parsed: unknown = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(validateLocalMessage)
      .filter((msg): msg is LocalMessage => msg !== undefined);
  } catch (error) {
    logger.error("Failed to parse localStorage messages JSON", {
      error,
      length: json.length,
      preview: json.slice(0, 200),
    });
    return [];
  }
}

// Re-export types for consumers
export type { LocalChat, LocalMessage };
