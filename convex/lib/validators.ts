import { v } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";

// Shared validators for backend-only usage
// Note: Do not re-export Convex-generated types from _generated/*

export const vSearchResult = v.object({
  title: v.string(),
  url: v.string(),
  snippet: v.string(),
  relevanceScore: v.number(),
  // Optional fields from search results
  content: v.optional(v.string()),
  fullTitle: v.optional(v.string()),
  summary: v.optional(v.string()),
});

export const vContextReference = v.object({
  contextId: v.string(),
  type: v.union(
    v.literal("search_result"),
    v.literal("scraped_page"),
    v.literal("research_summary"),
  ),
  url: v.optional(v.string()),
  title: v.optional(v.string()),
  timestamp: v.number(),
  relevanceScore: v.optional(v.number()),
  metadata: v.optional(v.any()),
});

/**
 * Validate if a string is a valid Convex ID format
 * Convex IDs contain a pipe separator (|) and follow the pattern: table|identifier
 *
 * @param str - String to validate
 * @returns True if the string appears to be a valid Convex ID format
 *
 * @example
 * isValidConvexIdFormat("kg24lrv8sq2j9xf0v2q8k6z5sw6z") // true (standard format)
 * isValidConvexIdFormat("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z") // true (with table prefix)
 * isValidConvexIdFormat("invalid-uuid") // false
 * isValidConvexIdFormat("") // false
 */
export function isValidConvexIdFormat(str: string): boolean {
  if (!str || typeof str !== "string") {
    return false;
  }

  // Convex IDs are non-empty strings that contain the pipe separator
  // and have a specific base32-like encoding pattern
  return str.includes("|") && str.length > 10;
}

/**
 * Safely cast a string to a Convex ID with runtime validation
 * Returns null if the string is not a valid Convex ID format
 *
 * @param str - String to cast to Convex ID
 * @returns Typed Convex ID or null if invalid
 *
 * @example
 * const chatId = safeConvexId<"chats">("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
 * if (chatId) {
 *   await ctx.db.get(chatId);
 * }
 */
export function safeConvexId<TableName extends TableNames>(
  str: string | null | undefined,
): Id<TableName> | null {
  if (!str || !isValidConvexIdFormat(str)) {
    return null;
  }
  return str as Id<TableName>;
}
