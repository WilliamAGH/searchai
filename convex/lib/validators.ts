import { v } from "convex/values";
import type { Id, TableNames } from "../_generated/dataModel";

// Shared validators for backend-only usage
// Note: Do not re-export Convex-generated types from _generated/*

/**
 * Type guard to check if a value is a plain record (object).
 * Shared utility to avoid duplicate implementations across modules.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * Search method validator.
 * Values must match SEARCH_METHODS const in constants/search.ts (source of truth).
 * @see {@link ./constants/search.ts} SEARCH_METHODS - canonical list
 */
export const vSearchMethod = v.union(
  v.literal("serp"),
  v.literal("openrouter"),
  v.literal("duckduckgo"),
  v.literal("fallback"),
);

export const vSearchResult = v.object({
  title: v.string(),
  url: v.string(),
  snippet: v.string(),
  relevanceScore: v.number(),
  // Optional fields from search results
  content: v.optional(v.string()),
  fullTitle: v.optional(v.string()),
  summary: v.optional(v.string()),
  kind: v.optional(
    v.union(v.literal("search_result"), v.literal("scraped_page")),
  ),
});

export const vScrapedContent = v.object({
  url: v.string(),
  title: v.string(),
  content: v.string(),
  summary: v.string(),
  contentLength: v.number(),
  scrapedAt: v.number(),
  contextId: v.string(),
  relevanceScore: v.optional(v.number()),
  sourceType: v.optional(
    v.union(v.literal("search_result"), v.literal("scraped_page")),
  ),
});

export const vSerpEnrichment = v.object({
  knowledgeGraph: v.optional(
    v.object({
      title: v.optional(v.string()),
      type: v.optional(v.string()),
      description: v.optional(v.string()),
      attributes: v.optional(v.record(v.string(), v.string())),
      url: v.optional(v.string()),
    }),
  ),
  answerBox: v.optional(
    v.object({
      type: v.optional(v.string()),
      answer: v.optional(v.string()),
      snippet: v.optional(v.string()),
      source: v.optional(v.string()),
      url: v.optional(v.string()),
    }),
  ),
  relatedQuestions: v.optional(
    v.array(
      v.object({
        question: v.string(),
        snippet: v.optional(v.string()),
      }),
    ),
  ),
  peopleAlsoAsk: v.optional(
    v.array(
      v.object({
        question: v.string(),
        snippet: v.optional(v.string()),
      }),
    ),
  ),
  relatedSearches: v.optional(v.array(v.string())),
});

export const vWebResearchSource = v.object({
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
 * TypeScript type for web research sources (derived from validator).
 *
 * Keep this aligned with `convex/schemas/webResearchSources.ts`.
 */
export interface WebResearchSource {
  contextId: string;
  type: "search_result" | "scraped_page" | "research_summary";
  url?: string;
  title?: string;
  timestamp: number;
  relevanceScore?: number;
  metadata?: unknown;
}

const LOCAL_ID_PREFIXES = ["local_", "chat_", "msg_"];
const CONVEX_ID_PATTERN = /^[a-z0-9]+$/i;

function extractRawIdentifier<TableName extends TableNames>(
  str: Id<TableName>,
): Id<TableName> | null;
function extractRawIdentifier(str: string): string | null;
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

export function isConvexId<TableName extends TableNames>(
  str: string,
): str is Id<TableName> {
  return isValidConvexIdFormat(str);
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
  if (!str || !isConvexId<TableName>(str)) {
    return null;
  }

  const raw = extractRawIdentifier(str);
  return raw;
}
