import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";
import { authTables } from "@convex-dev/auth/server";

const applicationTables = {
  chats: defineTable({
    title: v.string(),
    userId: v.optional(v.id("users")),
    shareId: v.optional(v.string()),
    isShared: v.optional(v.boolean()),
    isPublic: v.optional(v.boolean()),
    createdAt: v.number(),
    updatedAt: v.number(),
  })
    .index("by_user", ["userId"])
    .index("by_share_id", ["shareId"]),

  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    searchResults: v.optional(v.array(v.object({
      title: v.string(),
      url: v.string(),
      snippet: v.string(),
      relevanceScore: v.optional(v.number()),
    }))),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.string()), // Add reasoning tokens field
    searchMethod: v.optional(v.union(v.literal("serp"), v.literal("openrouter"), v.literal("duckduckgo"), v.literal("fallback"))),
    hasRealResults: v.optional(v.boolean()),
    timestamp: v.number(),
  })
    .index("by_chat", ["chatId"]),

  searchCache: defineTable({
    query: v.string(),
    results: v.array(v.object({
      title: v.string(),
      url: v.string(),
      snippet: v.string(),
      relevanceScore: v.optional(v.number()),
    })),
    cachedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_query", ["query"])
    .index("by_expiry", ["expiresAt"]),

  urlContent: defineTable({
    url: v.string(),
    title: v.string(),
    content: v.string(),
    summary: v.optional(v.string()),
    cachedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_url", ["url"])
    .index("by_expiry", ["expiresAt"]),

  userPreferences: defineTable({
    userId: v.id("users"),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    searchEnabled: v.boolean(),
    maxSearchResults: v.number(),
  })
    .index("by_user", ["userId"]),
};

export default defineSchema({
  ...authTables,
  ...applicationTables,
});
