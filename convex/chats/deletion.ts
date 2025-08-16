/**
 * Chat deletion operations
 * - Delete chat and cascade to messages
 * - Validate ownership for both authenticated and anonymous users
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Delete chat and messages
 * - Cascades to all messages
 * - Validates ownership for authenticated or anonymous users
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 */
export const deleteChat = mutation({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    const userId = await getAuthUserId(ctx);

    // Validate ownership: user is authenticated and owns the chat, or is anonymous and owns the chat
    const isOwner =
      (userId && chat.userId === userId) ||
      (args.sessionId && chat.sessionId === args.sessionId);

    if (!isOwner) {
      throw new Error("Unauthorized to delete this chat");
    }

    // Delete all messages in the chat via async iteration to reduce memory usage
    const q = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId));
    for await (const message of q) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(args.chatId);

    // Best-effort: also invalidate planner cache for this chat
    // Note: Disabled to avoid circular dependency; enable once dependency issue is resolved.
  },
});
