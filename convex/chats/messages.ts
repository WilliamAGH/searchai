/**
 * Message-related chat operations
 * - Fetching messages for a chat
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { vSearchResult } from "../lib/validators";

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @returns Array of messages
 */
export const getChatMessages = query({
  args: { chatId: v.id("chats") },
  returns: v.array(
    v.object({
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
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    // Allow access to:
    // - Anonymous chats (no userId)
    // - The owner's chats
    // - Publicly shared chats (privacy: "shared" or "public")
    const privacy = chat.privacy;
    const isSharedOrPublic = privacy === "shared" || privacy === "public";
    if (chat.userId && chat.userId !== userId && !isSharedOrPublic) return [];

    const docs = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    // Map to validated/minimal shape
    return docs.map((m) => ({
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
  },
});
