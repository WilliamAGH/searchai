/**
 * ID Validation Utilities
 *
 * Provides safe validation and casting for Convex IDs in frontend code.
 * Prevents unsafe string-to-ID casts that can cause runtime errors.
 *
 * @note Accepted duplication: This module mirrors validation logic in
 * convex/lib/validators.ts for bundle isolation. Both implementations
 * should remain in sync.
 * @see {@link ../../../../convex/lib/validators.ts} - backend version
 */

import type { Id, TableNames } from "../../../convex/_generated/dataModel";

const LOCAL_ID_PREFIXES = ["local_", "chat_", "msg_"];
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

/**
 * Check if a string is a local (frontend-generated) ID
 * Local IDs use prefixes like "local_", "chat_", "msg_"
 */
export function isLocalId(str: string | null | undefined): boolean {
  if (!str || typeof str !== "string") {
    return false;
  }
  return LOCAL_ID_PREFIXES.some((prefix) => str.startsWith(prefix));
}

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

export function isConvexId<TableName extends TableNames>(
  str: string,
): str is Id<TableName> {
  return isValidConvexId(str);
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
export function toConvexId<TableName extends TableNames>(
  str: string | null | undefined,
): Id<TableName> | null {
  if (!str || !isConvexId<TableName>(str)) {
    return null;
  }
  return str;
}
