import { v } from "convex/values";

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
