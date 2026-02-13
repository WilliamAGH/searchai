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
import {
  vSearchMethod,
  vSearchResult,
  vWebResearchSource,
} from "./lib/validators";

const applicationTables = {
  /**
   * Chats table
   * - User conversations
   * - Share IDs for URLs
   * - Rolling summaries for context
   * - UUID v7 thread tracking for external integrations
   */
  chats: defineTable({
    title: v.string(),
    userId: v.optional(v.id("users")),
    sessionId: v.optional(v.string()),
    shareId: v.optional(v.string()),
    publicId: v.optional(v.string()),
    threadId: v.optional(v.string()), // UUID v7 for conversation thread tracking
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
    .index("by_privacy", ["privacy"])
    .index("by_share_id", ["shareId"])
    .index("by_public_id", ["publicId"])
    .index("by_thread_id", ["threadId"]),

  /**
   * Messages table
   * - Chat messages (user/assistant)
   * - Search results metadata
   * - Streaming state tracking
   * - Reasoning/thinking tokens
   * - UUID v7 message and thread tracking for context continuity
   */
  messages: defineTable({
    chatId: v.id("chats"),
    messageId: v.optional(v.string()), // UUID v7 for unique message tracking
    threadId: v.optional(v.string()), // UUID v7 for thread/conversation tracking
    role: v.union(
      v.literal("user"),
      v.literal("assistant"),
      v.literal("system"),
    ),
    content: v.optional(v.string()),
    /**
     * @deprecated UI projection only. The canonical, persisted source-of-truth
     * for web research is `webResearchSources`.
     *
     * Kept temporarily for migration/cutover.
     */
    searchResults: v.optional(v.array(vSearchResult)),
    /**
     * @deprecated Not canonical web research. This is (historically) a list of
     * bracket-citations extracted from the assistant text, and may contain
     * domains rather than URLs.
     *
     * Kept temporarily for migration/cutover.
     */
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.any()),
    searchMethod: v.optional(vSearchMethod),
    hasRealResults: v.optional(v.boolean()),
    isStreaming: v.optional(v.boolean()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    timestamp: v.optional(v.number()),
    /**
     * Canonical: structured web research sources used by the system.
     *
     * This is the single persisted research source contract for the app.
     */
    webResearchSources: v.optional(v.array(vWebResearchSource)),
    /**
     * @deprecated Old name for web research sources.
     * Kept temporarily for migration/cutover.
     */
    contextReferences: v.optional(v.array(vWebResearchSource)),
    // Agent workflow tracking
    workflowId: v.optional(v.string()), // Links to agent orchestration workflow
    // Image attachments (Convex File Storage references)
    imageStorageIds: v.optional(v.array(v.id("_storage"))),
  })
    .index("by_chatId", ["chatId"])
    .index("by_messageId", ["messageId"])
    .index("by_threadId", ["threadId"]),

  /**
   * Agent workflow tokens
   * - Tracks per-workflow nonce/signature for replay prevention
   */
  workflowTokens: defineTable({
    workflowId: v.string(),
    nonce: v.string(),
    signature: v.string(),
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    status: v.union(
      v.literal("active"),
      v.literal("completed"),
      v.literal("invalidated"),
    ),
    issuedAt: v.number(),
    expiresAt: v.number(),
  })
    .index("by_workflow", ["workflowId"])
    .index("by_chat", ["chatId"]),

  /**
   * Agent workflow events
   * - Streaming events for real-time workflow progress
   * - Polled by HTTP handler to stream to client
   * - Auto-cleaned after completion
   */
  workflowEvents: defineTable({
    workflowId: v.string(),
    sequence: v.number(), // Event order
    type: v.string(), // "progress", "reasoning", "tool_call", "complete", "error"
    data: v.any(), // Event payload
    timestamp: v.number(),
  })
    .index("by_workflow_sequence", ["workflowId", "sequence"])
    .index("by_workflow", ["workflowId"]),

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
