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
 *
 * OPTIMIZATION: Processes in batches to stay under Convex's 4,096 read limit
 * - Batch size: 500 chats per execution (500 chats + 500 message checks = 1,000 reads)
 * - Runs frequently (every 5-10 min) to process incrementally
 * - Uses creation time ordering to process oldest first
 */
export const cleanupEmptyChats = internalMutation({
  args: {},
  handler: async (ctx) => {
    const oneHourAgo = Date.now() - 60 * 60 * 1000;
    const BATCH_SIZE = 500; // Conservative limit to stay well under 4,096 reads

    // Query old chats in batches, ordered by creation time (oldest first)
    // This ensures we process chats that need cleanup most urgently
    const oldChats = await ctx.db
      .query("chats")
      .order("asc") // Process oldest first
      .take(BATCH_SIZE);

    let deletedCount = 0;
    let skippedCount = 0;

    for (const chat of oldChats) {
      // Skip if chat is less than 1 hour old
      if (chat._creationTime > oneHourAgo) {
        skippedCount++;
        continue;
      }

      // Check if chat has any messages
      const hasMessages = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", chat._id))
        .first();

      // Delete if no messages exist
      if (!hasMessages) {
        await ctx.db.delete(chat._id);
        deletedCount++;
      }
    }

    if (deletedCount > 0 || skippedCount > 0) {
      console.info(
        `[CLEANUP] Deleted ${deletedCount} empty chats, skipped ${skippedCount} recent chats (batch size: ${oldChats.length})`,
      );
    }

    return {
      deletedCount,
      skippedCount,
      batchSize: oldChats.length,
      hasMore: oldChats.length === BATCH_SIZE,
    };
  },
});
