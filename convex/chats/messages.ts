/**
 * Message-related chat operations
 * - Fetching messages for a chat
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { vSearchResult } from "../lib/validators";
import { debugStart, debugEnd } from "../lib/debug";

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 * @returns Array of messages
 */
export const getChatMessages = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.array(
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
      searchResults: v.optional(v.array(vSearchResult)),
      sources: v.optional(v.array(v.string())),
      reasoning: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    debugStart("chats.messages.getChatMessages", {
      hasSessionId: !!args.sessionId,
    });
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    // Check authorization:
    // For authenticated users: check userId matches
    if (chat.userId) {
      if (chat.userId !== userId) {
        // Allow access to shared/public chats
        const isSharedOrPublic =
          chat.privacy === "shared" || chat.privacy === "public";
        if (!isSharedOrPublic) return [];
      }
    }
    // For anonymous chats: check sessionId matches
    else if (chat.sessionId) {
      if (!args.sessionId || chat.sessionId !== args.sessionId) return [];
    }
    // For shared/public chats without userId or sessionId: allow access
    else if (chat.privacy !== "shared" && chat.privacy !== "public") {
      return [];
    }

    const docs = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    // Map to validated/minimal shape
    const result = docs.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      chatId: m.chatId,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
      streamedContent: m.streamedContent,
      thinking: m.thinking,
      searchResults: Array.isArray(m.searchResults)
        ? m.searchResults
        : undefined,
      sources: Array.isArray(m.sources) ? m.sources : undefined,
      reasoning: m.reasoning,
    }));
    debugEnd("chats.messages.getChatMessages", { count: result.length });
    return result;
  },
});
