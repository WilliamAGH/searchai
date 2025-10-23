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
