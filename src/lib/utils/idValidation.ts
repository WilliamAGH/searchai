/**
 * ID Validation Utilities
 *
 * Provides safe validation and casting for Convex IDs in frontend code.
 * Prevents unsafe string-to-ID casts that can cause runtime errors.
 */

import type { Id } from "../../../convex/_generated/dataModel";

const LOCAL_ID_PREFIXES = ["local_", "chat_", "msg_"];
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

function extractRawIdentifier(str: string): string | null {
  if (LOCAL_ID_PREFIXES.some((prefix) => str.startsWith(prefix))) {
    return null;
  }

  const normalized = str.includes("|") ? (str.split("|").pop() ?? "") : str;
  if (!normalized) {
    return null;
  }

  return CONVEX_ID_PATTERN.test(normalized) ? normalized : null;
}

/**
 * Validate if a string is a valid Convex ID format
 * Accepts both modern base32 IDs and legacy `table|id` strings
 */
export function isValidConvexId(str: string | null | undefined): boolean {
  if (!str || typeof str !== "string") {
    return false;
  }

  return extractRawIdentifier(str) !== null;
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
  if (!id || typeof id !== "string") {
    return false;
  }

  return LOCAL_ID_PREFIXES.some((prefix) => id.startsWith(prefix));
}
