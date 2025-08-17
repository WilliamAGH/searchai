/**
 * Shared utility for generating stable message keys
 *
 * CRITICAL: This utility ensures that React keys are unique and stable across
 * all message list components. Having duplicate key generation logic was causing
 * React warnings about duplicate keys.
 *
 * This single source of truth prevents:
 * - Duplicate key warnings
 * - Unnecessary re-renders
 * - Focus loss issues
 * - State corruption
 */

import type { Message } from "../types/message";

// WeakMap to store ephemeral keys for messages without IDs
const ephemeralKeyMap = new WeakMap<Message, string>();
let ephemeralKeyCounter = 0;

/**
 * Generate a stable, unique key for a message
 *
 * Priority order:
 * 1. Use message._id if available (Convex messages)
 * 2. Use message.id if available (streaming messages)
 * 3. Check WeakMap cache for previously generated key
 * 4. Generate new ephemeral key and cache it
 *
 * @param msg - The message object
 * @param index - Optional index for additional uniqueness
 * @returns A unique, stable key for the message
 */
export function getMessageKey(
  msg: Message | null | undefined,
  index?: number,
): string {
  if (!msg) {
    // Fallback for invalid message objects
    const fallbackKey = `invalid-${index ?? 0}-${Date.now().toString(36)}-${++ephemeralKeyCounter}`;
    if (import.meta.env.DEV) {
      console.warn("[KEY] No message object, using fallback:", fallbackKey);
    }
    return fallbackKey;
  }

  // Check for existing ID fields
  const msgRecord = msg as Record<string, unknown>;
  const existingId =
    msg._id ||
    (typeof msgRecord.id === "string" && msgRecord.id !== "undefined"
      ? msgRecord.id
      : null);

  // If message has a valid ID, use it directly
  if (existingId) {
    return String(existingId);
  }

  // Check WeakMap for cached ephemeral key
  let cachedKey = ephemeralKeyMap.get(msg);
  if (cachedKey) {
    return cachedKey;
  }

  // Generate a new ephemeral key with multiple uniqueness factors
  const contentHash = msg.content
    ? msg.content.slice(0, 10).replace(/[^a-z0-9]/gi, "")
    : "empty";
  const rolePrefix = msg.role === "assistant" ? "ai" : "usr";
  const timestamp = Date.now().toString(36);
  const counter = ++ephemeralKeyCounter;
  const random = Math.random().toString(36).slice(2, 8);

  const newKey = `tmp-${rolePrefix}-${contentHash}-${timestamp}-${counter}-${random}`;

  // Cache the key for this message object
  ephemeralKeyMap.set(msg, newKey);

  // Debug logging disabled to avoid console noise
  // Uncomment for debugging key generation issues
  // if (import.meta.env.DEV) {
  //   console.info("[KEY] Generated ephemeral key:", {
  //     key: newKey,
  //     message: { role: msg.role, contentPreview: msg.content?.slice(0, 50) }
  //   });
  // }

  return newKey;
}

/**
 * Clear the ephemeral key cache
 * Call this when messages are completely replaced (e.g., chat switch)
 */
export function clearMessageKeyCache(): void {
  ephemeralKeyCounter = 0;
  // WeakMap will automatically garbage collect unreferenced keys
}

/**
 * Validate that all messages in a list have unique keys
 * Useful for debugging duplicate key issues
 */
export function validateMessageKeys(messages: Message[]): boolean {
  const keys = new Set<string>();
  const duplicates: string[] = [];

  messages.forEach((msg, index) => {
    const key = getMessageKey(msg, index);
    if (keys.has(key)) {
      duplicates.push(key);
    }
    keys.add(key);
  });

  if (duplicates.length > 0 && import.meta.env.DEV) {
    console.error("[KEY] Duplicate message keys detected:", duplicates);
    return false;
  }

  return true;
}
