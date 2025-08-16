/**
 * Load more messages action for pagination
 * - Reuses the paginated query logic
 * - Provides action interface for frontend
 */
import { action } from "../_generated/server";
import { v } from "convex/values";

/**
 * IMPORTANT TS2589 WORKAROUND:
 * Using require pattern to avoid deep type instantiation error
 * when calling the paginated query from an action
 */
// Use require to avoid TS2589 at import time
const { api } = require("../_generated/api") as any;

/**
 * Load more messages for a chat
 * - Action wrapper around paginated query
 * - Handles cursor-based pagination
 * @param chatId - Chat database ID
 * @param cursor - Pagination cursor from previous response
 * @param limit - Number of messages to return (default: 50)
 * @returns Object with messages array and nextCursor
 */
export const loadMoreMessages = action({
  args: {
    chatId: v.id("chats"),
    cursor: v.id("messages"),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    messages: v.array(
      v.object({
        _id: v.id("messages"),
        role: v.union(
          v.literal("user"),
          v.literal("assistant"),
          v.literal("system"),
        ),
        content: v.optional(v.string()),
        timestamp: v.optional(v.number()),
        isStreaming: v.optional(v.boolean()),
        streamedContent: v.optional(v.string()),
        thinking: v.optional(v.string()),
        searchResults: v.optional(
          v.array(
            v.object({
              title: v.string(),
              url: v.string(),
              snippet: v.string(),
              relevanceScore: v.number(),
            }),
          ),
        ),
        sources: v.optional(v.array(v.string())),
        reasoning: v.optional(v.string()),
      }),
    ),
    nextCursor: v.optional(v.id("messages")),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    try {
      const result = await ctx.runQuery(
        api.chats.messagesPaginated.getChatMessagesPaginated,
        {
          chatId: args.chatId,
          cursor: args.cursor,
          limit: args.limit,
        },
      );

      return result;
    } catch (error) {
      console.error("Failed to load more messages:", error);
      // Return empty result to maintain API contract
      return {
        messages: [],
        nextCursor: undefined,
        hasMore: false,
      };
    }
  },
});
