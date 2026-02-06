/**
 * Paginated message operations for better performance
 * - Supports cursor-based pagination
 * - Returns messages in chronological order
 * - SECURITY: Validates cursor ownership before query execution
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import {
  hasSessionAccess,
  hasUserAccess,
  isSharedOrPublicChat,
} from "../lib/auth";
import { vWebResearchSource } from "../lib/validators";
import { isValidUuidV7 } from "../lib/uuid";
import { projectMessage } from "./messageProjection";

const assertValidSessionId = (sessionId?: string) => {
  if (sessionId && !isValidUuidV7(sessionId)) {
    throw new Error("Invalid sessionId format");
  }
};

type PaginatedMessagesResult = {
  messages: ReturnType<typeof projectMessage>[];
  nextCursor: Id<"messages"> | undefined;
  hasMore: boolean;
};

const EMPTY_PAGE: PaginatedMessagesResult = {
  messages: [],
  nextCursor: undefined,
  hasMore: false,
};

/**
 * Get paginated chat messages
 * - Validates chat ownership
 * - Returns messages with pagination info
 * @param chatId - Chat database ID
 * @param limit - Number of messages to return (default: 50)
 * @param cursor - Pagination cursor (optional)
 * @returns Object with messages array and nextCursor
 */
export const getChatMessagesPaginated = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    limit: v.optional(v.number()),
    cursor: v.optional(v.id("messages")),
  },
  returns: v.object({
    messages: v.array(
      v.object({
        _id: v.id("messages"),
        _creationTime: v.number(),
        chatId: v.id("chats"),
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
        reasoning: v.optional(v.string()),
        webResearchSources: v.optional(v.array(vWebResearchSource)),
        workflowId: v.optional(v.string()),
      }),
    ),
    nextCursor: v.optional(v.id("messages")),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    assertValidSessionId(args.sessionId);
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) {
      return EMPTY_PAGE;
    }

    const isSharedOrPublic = isSharedOrPublicChat(chat);
    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isUserOwner && !isSessionOwner) {
      return EMPTY_PAGE;
    }

    const pageSize = Math.min(args.limit || 50, 100); // Max 100 messages per page

    // Build the query
    let baseQuery = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc"); // Get newest first, we'll reverse later

    // Helper: fetch a page (newest first, then reverse) with nextCursor/hasMore
    const fetchPage = async (q: typeof baseQuery) => {
      const docs = await q.take(pageSize + 1);
      const hasMorePage = docs.length > pageSize;
      const pageDocs = docs.slice(0, pageSize);
      const nextCursorPage =
        hasMorePage && pageDocs.length > 0
          ? pageDocs[pageDocs.length - 1]._id
          : undefined;
      const formatted = [...pageDocs].reverse().map(projectMessage);
      return {
        messages: formatted,
        nextCursor: nextCursorPage,
        hasMore: hasMorePage,
      };
    };

    // If we have a cursor, validate it BEFORE using it in any query
    if (args.cursor) {
      const cursorMessage = await ctx.db.get(args.cursor);
      // SECURITY: Validate cursor belongs to the requested chat BEFORE any query execution
      // This prevents a malicious cursor from a different chat exposing unauthorized data
      if (!cursorMessage || cursorMessage.chatId !== args.chatId) {
        return EMPTY_PAGE;
      }

      // Cursor is valid and belongs to this chat - continue from the cursor position
      baseQuery = baseQuery.filter((q) =>
        q.lt(q.field("_creationTime"), cursorMessage._creationTime),
      );
    }

    // Normal page fetch
    return await fetchPage(baseQuery);
  },
});

/**
 * Get initial messages for a chat (most recent N messages)
 * Useful for initial load without pagination UI
 */
export const getRecentChatMessages = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    assertValidSessionId(args.sessionId);
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return [];

    const isSharedOrPublic = isSharedOrPublicChat(chat);
    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isUserOwner && !isSessionOwner) {
      return [];
    }

    // Get messages directly
    const limit = args.limit || 50;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(limit);

    // Reverse to get chronological order
    return messages.reverse();
  },
});
