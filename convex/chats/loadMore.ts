/**
 * Load more messages action for pagination
 * - Reuses the paginated query logic
 * - Provides action interface for frontend
 */
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import { getErrorMessage } from "../lib/errors";

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
    // Error fields - present when load failed
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const result: any = await ctx.runQuery(
        // @ts-ignore - Known Convex TS2589 issue with complex type inference
        api.chats.messagesPaginated.getChatMessagesPaginated,
        {
          chatId: args.chatId,
          cursor: args.cursor,
          limit: args.limit,
        },
      );

      return result;
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error("Failed to load more messages:", {
        chatId: args.chatId,
        cursor: args.cursor,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
      // Return error state so callers can distinguish "no messages" from "query failed"
      return {
        messages: [],
        nextCursor: undefined,
        hasMore: false,
        error: `Failed to load messages: ${errorMessage}`,
        errorCode: "LOAD_MESSAGES_FAILED",
      };
    }
  },
});
