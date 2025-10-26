import { v } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";
import type { ResearchContextReference as ResearchContextReferenceType } from "../agents/types";

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

// Re-export the TS type used across orchestration to keep validator and TS shape aligned.
// NOTE: This indirection prevents V8 runtimes from importing `orchestration_helpers.ts`
// (which uses `node:crypto`). Always import the type from `../agents/types` or from this
// re-export, never from the Node-only helpers.
export type ResearchContextReference = ResearchContextReferenceType;

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
 * Validate if a string is a candidate Convex ID
 *
 * Convex guarantees IDs are stable strings (see docs.convex.dev/database/document-ids).
 * We only reject values that match client-generated "local" identifiers.
 */
export function isValidConvexIdFormat(str: string): boolean {
  if (!str || typeof str !== "string") {
    return false;
  }

  return extractRawIdentifier(str) !== null;
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
