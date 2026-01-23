/**
 * Chat deletion operations
 * - Delete chat and cascade to messages
 * - Validate ownership
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../_generated/server";

/**
 * Delete chat and messages
 * - Cascades to all messages
 * - Validates ownership
 * @param chatId - Chat database ID
 */
export const deleteChat = mutation({
  args: { chatId: v.id("chats"), sessionId: v.optional(v.string()) },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    // Silently succeed if chat already deleted (idempotent operation)
    if (!chat) return null;
    const hasUserAccess = !!(chat.userId && userId && chat.userId === userId);
    const hasSessionAccess = !!(
      chat.sessionId &&
      args.sessionId &&
      chat.sessionId === args.sessionId
    );
    if (!hasUserAccess && !hasSessionAccess) {
      throw new Error("Unauthorized");
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
