/**
 * Paginated message operations for better performance
 * - Supports cursor-based pagination
 * - Returns messages in chronological order
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { vSearchResult } from "../lib/validators";

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
    limit: v.optional(v.number()),
    cursor: v.optional(v.string()),
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
        searchResults: v.optional(v.array(vSearchResult)),
        sources: v.optional(v.array(v.string())),
        reasoning: v.optional(v.string()),
      }),
    ),
    nextCursor: v.optional(v.string()),
    hasMore: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) {
      return {
        messages: [],
        hasMore: false,
      };
    }

    // Allow access to:
    // - Anonymous chats (no userId)
    // - The owner's chats
    // - Publicly shared chats (privacy: "shared" or "public")
    const privacy = chat.privacy;
    const isSharedOrPublic = privacy === "shared" || privacy === "public";
    if (chat.userId && chat.userId !== userId && !isSharedOrPublic) {
      return {
        messages: [],
        hasMore: false,
      };
    }

    const pageSize = Math.min(args.limit || 50, 100); // Max 100 messages per page

    // Build the query
    let query = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc"); // Get newest first, we'll reverse later

    // If we have a cursor, start after it
    if (args.cursor) {
      const cursorDoc = await ctx.db.get(args.cursor as any);
      if (cursorDoc) {
        // Continue from the cursor position
        query = query.filter((q) =>
          q.lt(q.field("_creationTime"), cursorDoc._creationTime),
        );
      }
    }

    // Get one extra to determine if there are more pages
    const docs = await query.take(pageSize + 1);

    // Check if there are more messages
    const hasMore = docs.length > pageSize;
    const messages = docs.slice(0, pageSize);

    // Reverse to get chronological order (oldest to newest)
    const reversedMessages = messages.reverse();

    // Map to validated/minimal shape with IDs for cursor
    const formattedMessages = reversedMessages.map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
      streamedContent: m.streamedContent,
      thinking: m.thinking,
      searchResults: m.searchResults || [],
      sources: m.sources || [],
      reasoning: m.reasoning,
    }));

    // Get the cursor for the next page (the oldest message in this batch)
    const nextCursor =
      hasMore && messages.length > 0
        ? messages[messages.length - 1]._id
        : undefined;

    return {
      messages: formattedMessages,
      nextCursor,
      hasMore,
    };
  },
});

/**
 * Get initial messages for a chat (most recent N messages)
 * Useful for initial load without pagination UI
 */
export const getRecentChatMessages = query({
  args: {
    chatId: v.id("chats"),
    limit: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    // Get auth
    const userId = await getAuthUserId(ctx);

    // Get the chat to verify ownership
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    // Check authorization
    if (chat.userId !== userId) {
      throw new Error("Unauthorized");
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
