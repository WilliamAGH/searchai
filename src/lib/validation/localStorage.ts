/**
 * localStorage Validation
 * Uses Convex's validator patterns for consistency
 * Only for client-side data that doesn't go through Convex
 */

import type { LocalChat } from "../types/chat";
import type { LocalMessage } from "../types/message";

/**
 * Validate localStorage chat data
 * Returns validated data or undefined if invalid
 */
export function validateLocalChat(data: unknown): LocalChat | undefined {
  if (!data || typeof data !== "object") return undefined;

  const chat = data as Record<string, unknown>;

  // Validate required fields
  if (typeof chat._id !== "string" || !chat._id.startsWith("local_"))
    return undefined;
  if (typeof chat.title !== "string") return undefined;
  if (typeof chat.createdAt !== "number") return undefined;
  if (typeof chat.updatedAt !== "number") return undefined;

  // Ensure local flags
  if (chat.isLocal !== true || chat.source !== "local") return undefined;

  // Validate optional fields
  if (chat.privacy && !["private", "shared", "public"].includes(chat.privacy))
    return undefined;

  return chat as LocalChat;
}

/**
 * Validate localStorage message data
 * Returns validated data or undefined if invalid
 */
export function validateLocalMessage(data: unknown): LocalMessage | undefined {
  if (!data || typeof data !== "object") return undefined;

  const msg = data as Record<string, unknown>;

  // Validate required fields
  if (typeof msg._id !== "string") return undefined;
  if (typeof msg.chatId !== "string") return undefined;
  if (!["user", "assistant", "system"].includes(msg.role)) return undefined;

  // Ensure local flags
  if (msg.isLocal !== true || msg.source !== "local") return undefined;

  // Optional fields don't need validation, just type checking
  if (msg.content && typeof msg.content !== "string") return undefined;
  if (msg.timestamp && typeof msg.timestamp !== "number") return undefined;

  return msg as LocalMessage;
}

/**
 * Safely parse JSON from localStorage
 * Returns validated array or empty array on error
 */
export function parseLocalChats(json: string): LocalChat[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(validateLocalChat)
      .filter((chat): chat is LocalChat => chat !== undefined);
  } catch {
    return [];
  }
}

/**
 * Safely parse messages from localStorage
 * Returns validated array or empty array on error
 */
export function parseLocalMessages(json: string): LocalMessage[] {
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map(validateLocalMessage)
      .filter((msg): msg is LocalMessage => msg !== undefined);
  } catch {
    return [];
  }
}
