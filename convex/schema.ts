import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

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
    chatId: v.id('chats'),
    role: v.union(v.literal('user'), v.literal('assistant'), v.literal('system')),
    content: v.optional(v.string()),
    searchResults: v.optional(v.array(v.any())),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.any()),
    searchMethod: v.optional(v.union(v.literal('serp'), v.literal('openrouter'), v.literal('duckduckgo'), v.literal('fallback'))),
    hasRealResults: v.optional(v.boolean()),
    isStreaming: v.optional(v.boolean()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  }).index('by_chatId', ['chatId']),

  preferences: defineTable({
    userId: v.string(),
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
