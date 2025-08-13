/**
 * Message-related chat operations
 * - Fetching messages for a chat
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @returns Array of messages
 */
export const getChatMessages = query({
  args: { chatId: v.id("chats") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    // Allow access to:
    // - Anonymous chats (no userId)
    // - The owner's chats
    // - Publicly shared chats (privacy: "shared" or "public")
    const privacy = (chat as unknown as { privacy?: string }).privacy;
    const isSharedOrPublic = privacy === "shared" || privacy === "public";
    if (chat.userId && chat.userId !== userId && !isSharedOrPublic) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();
  },
});
