/**
 * Load more messages action for pagination
 * - Reuses the paginated query logic
 * - Provides action interface for frontend
 */
import { action } from "../_generated/server";
import { api } from "../_generated/api";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { vContextReference, type ContextReference } from "../lib/validators";
import { getErrorMessage } from "../lib/errors";

/**
 * Paginated messages result type
 * Explicit type to avoid TS7022/TS7023 implicit any errors from @ts-ignore
 */
interface PaginatedMessagesResult {
  messages: Array<{
    _id: Id<"messages">;
    _creationTime: number;
    chatId: Id<"chats">;
    role: "user" | "assistant" | "system";
    content?: string;
    timestamp?: number;
    isStreaming?: boolean;
    streamedContent?: string;
    thinking?: string;
    searchResults?: Array<{
      title: string;
      url: string;
      snippet: string;
      relevanceScore: number;
    }>;
    sources?: string[];
    reasoning?: string;
    contextReferences?: ContextReference[];
    workflowId?: string;
  }>;
  nextCursor?: Id<"messages">;
  hasMore: boolean;
  error?: string;
  errorCode?: string;
}

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
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    messages: v.array(
      v.object({
        _id: v.id("messages"),
        _creationTime: v.number(),
        chatId: v.id("chats"),
        role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
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
        contextReferences: v.optional(v.array(vContextReference)),
        workflowId: v.optional(v.string()),
      }),
    ),
    nextCursor: v.optional(v.id("messages")),
    hasMore: v.boolean(),
    error: v.optional(v.string()),
    errorCode: v.optional(v.string()),
  }),
  handler: async (ctx, args): Promise<PaginatedMessagesResult> => {
    try {
      // @ts-ignore - Known Convex TS2589 issue with complex type inference
      return await ctx.runQuery(api.chats.messagesPaginated.getChatMessagesPaginated, {
        chatId: args.chatId,
        cursor: args.cursor,
        limit: args.limit,
        sessionId: args.sessionId,
      });
    } catch (error) {
      const errorMessage = getErrorMessage(error);
      console.error("Failed to load more messages:", {
        chatId: args.chatId,
        cursor: args.cursor,
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
      });
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
