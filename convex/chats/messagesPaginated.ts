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
    cursor: v.optional(v.id("messages")), // Fix: Use Id<"messages"> since cursor is a message ID
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
    nextCursor: v.optional(v.id("messages")), // Fix: Use Id<"messages"> since cursor is a message ID
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

    // Helper: fetch a page (newest first, then reverse) with nextCursor/hasMore
    const fetchPage = async (q: any) => {
      const docs = await q.take(pageSize + 1);
      const hasMorePage = docs.length > pageSize;
      const pageDocs = docs.slice(0, pageSize);
      const reversed = pageDocs.reverse();
      const formatted = reversed.map((m: any) => ({
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
      const nextCursorPage =
        hasMorePage && pageDocs.length > 0
          ? pageDocs[pageDocs.length - 1]._id
          : undefined;
      return {
        messages: formatted,
        nextCursor: nextCursorPage,
        hasMore: hasMorePage,
      };
    };

    // Build the query
    let baseQuery = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc"); // Get newest first, we'll reverse later

    // If we have a cursor, validate and start after it
    if (args.cursor) {
      // The cursor we return is a message _id
      const cursorMessage = await ctx.db.get(args.cursor);
      if (!cursorMessage) {
        // Invalid/expired cursor: recover by returning the most recent page
        return await fetchPage(baseQuery);
      }
      // Verify the cursor is from the same chat
      if (cursorMessage.chatId !== args.chatId) {
        // Cursor from different chat: return the most recent page
        return await fetchPage(baseQuery);
      }
      // Continue from the cursor position
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
    limit: v.optional(v.number()),
  },
  returns: v.array(
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
  handler: async (ctx, args) => {
    // Auth and chat
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return [];

    // Authorization aligned with paginated variant:
    // - allow owner
    // - allow anonymous chats (no userId)
    // - allow publicly shared chats (privacy: "shared" | "public")
    const privacy = chat.privacy;
    const isSharedOrPublic = privacy === "shared" || privacy === "public";
    if (chat.userId && chat.userId !== userId && !isSharedOrPublic) {
      return [];
    }

    // Get messages directly
    const limit = args.limit || 50;
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc")
      .take(limit);

    // Reverse to get chronological order and map to return only validated fields
    return messages.reverse().map((m) => ({
      _id: m._id,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
      streamedContent: m.streamedContent,
      thinking: m.thinking,
      searchResults: m.searchResults,
      sources: m.sources,
      reasoning: m.reasoning,
    }));
  },
});
