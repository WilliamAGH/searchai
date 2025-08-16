import { v } from "convex/values";

// Shared validators for backend-only usage
// Note: Do not re-export Convex-generated types from _generated/*

export const vSearchResult = v.object({
  title: v.string(),
  url: v.string(),
  snippet: v.string(),
  relevanceScore: v.number(),
  // Optional scraped content fields
  content: v.optional(v.string()), // Full scraped content
  fullTitle: v.optional(v.string()), // Title from scraped page
  summary: v.optional(v.string()), // Summary from scraped content
});
