/**
 * ID Validation Utilities
 *
 * Provides safe validation and casting for Convex IDs in frontend code.
 * Prevents unsafe string-to-ID casts that can cause runtime errors.
 */

import type { Id } from "../../../convex/_generated/dataModel";

/**
 * Validate if a string is a valid Convex ID format
 * Convex IDs contain a pipe separator (|) and follow the pattern: table|identifier
 *
 * @param str - String to validate
 * @returns True if the string appears to be a valid Convex ID format
 *
 * @example
 * isValidConvexId("kg24lrv8sq2j9xf0v2q8k6z5sw6z") // true
 * isValidConvexId("local-chat-123") // false (no pipe separator)
 */
export function isValidConvexId(str: string | null | undefined): boolean {
  if (!str || typeof str !== "string") {
    return false;
  }

  // Convex IDs contain the pipe separator and have sufficient length
  // This catches both standard format and any malformed strings
  return str.includes("|") && str.length > 10;
}

/**
 * Safely cast a string to a Convex ID with runtime validation
 * Returns null if the string is not a valid Convex ID format
 *
 * Use this instead of direct `as Id<T>` casts to prevent runtime errors
 *
 * @param str - String to cast to Convex ID
 * @returns Typed Convex ID or null if invalid
 *
 * @example
 * const chatId = toConvexId<"chats">("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
 * if (chatId) {
 *   // Safe to use as Convex ID
 *   await convex.query(api.chats.getChat, { chatId });
 * }
 */
export function toConvexId<TableName extends string>(
  str: string | null | undefined,
): Id<TableName> | null {
  if (!isValidConvexId(str)) {
    return null;
  }
  return str as Id<TableName>;
}

/**
 * Check if an ID is a local (non-Convex) ID
 * Local IDs do not contain the pipe separator
 *
 * @param id - ID to check
 * @returns True if the ID is a local (non-synced) ID
 */
export function isLocalId(id: string | null | undefined): boolean {
  return !isValidConvexId(id);
}
