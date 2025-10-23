/**
 * Cleanup utilities for chat maintenance
 * - Remove empty chats that were never used
 * - Scheduled to run periodically to keep database clean
 */

import { internalMutation } from "../_generated/server";

/**
 * Delete empty chats older than 1 hour
 * These are typically created but never used (no messages sent)
 *
 * Runs as a scheduled job to prevent database pollution
 */
export const cleanupEmptyChats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;

    // Find chats with no messages that are older than 1 hour
    const allChats = await ctx.db.query("chats").collect();

    let deletedCount = 0;

    for (const chat of allChats) {
      // Skip if chat is less than 1 hour old
      if (chat._creationTime > oneHourAgo) continue;

      // Check if chat has any messages
      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
        .first();

      // Delete if no messages exist
      if (!messages) {
        await ctx.db.delete(chat._id);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Cleaned up ${deletedCount} empty chats`);
    }

    return { deletedCount };
  },
});
