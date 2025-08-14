/**
 * Database schema definition
 * - Chat/message storage
 * - User preferences
 * - Analytics metrics
 * - Auth tables from Convex Auth
 */

import { authTables } from "@convex-dev/auth/server";
import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

const applicationTables = {
  /**
   * Chats table
   * - User conversations
   * - Share IDs for URLs
   * - Rolling summaries for context
   */
  chats: defineTable({
    title: v.string(),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.string()),
    shareId: v.optional(v.string()),
    publicId: v.optional(v.string()),
    privacy: v.optional(
      v.union(v.literal("private"), v.literal("shared"), v.literal("public")),
    ),
    createdAt: v.number(),
    updatedAt: v.number(),
    rollingSummary: v.optional(v.string()),
    rollingSummaryUpdatedAt: v.optional(v.number()),
  })
    .index("by_user", ["userId"])
    .index("by_sessionId", ["sessionId"])
    .index("by_share_id", ["shareId"])
    .index("by_public_id", ["publicId"]),

  /**
   * Messages table
   * - Chat messages (user/assistant)
   * - Search results metadata
   * - Streaming state tracking
   * - Reasoning/thinking tokens
   */
  messages: defineTable({
    chatId: v.id("chats"),
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    content: v.optional(v.string()),
    searchResults: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          snippet: v.string(),
          relevanceScore: v.number(), // Required, not optional - consistent with most definitions
        }),
      ),
    ),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.any()),
    searchMethod: v.optional(
      v.union(
        v.literal("serp"),
        v.literal("openrouter"),
        v.literal("duckduckgo"),
        v.literal("fallback"),
      ),
    ),
    hasRealResults: v.optional(v.boolean()),
    isStreaming: v.optional(v.boolean()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    timestamp: v.optional(v.number()),
  }).index("by_chatId", ["chatId"]),

  /**
   * Metrics table
   * - Daily aggregated counters
   * - Planner events
   * - User behavior tracking
   */
  metrics: defineTable({
    name: v.string(),
    date: v.string(), // YYYY-MM-DD
    chatId: v.optional(v.id("chats")),
    count: v.number(),
  }).index("by_name_and_date", ["name", "date"]),

  /**
   * User preferences
   * - Theme settings
   * - Search configuration
   * - Per-user customization
   */
  preferences: defineTable({
    userId: v.id("users"),
    theme: v.union(v.literal("light"), v.literal("dark"), v.literal("system")),
    searchEnabled: v.boolean(),
    maxSearchResults: v.number(),
  }).index("by_user", ["userId"]),
};

/**
 * Complete schema export
 * - Merges auth tables
 * - Includes app tables
 */
export default defineSchema({
  ...authTables,
  ...applicationTables,
});
