/**
 * Chat ownership claiming operations
 * Transfers anonymous chats to authenticated users
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Claim anonymous chats when user signs up or logs in
 * Transfers ownership of session chats to authenticated user
 * @param sessionId - Anonymous session to claim
 * @returns Number of chats claimed
 */
export const claimAnonymousChats = mutation({
  args: {
    sessionId: v.string(),
  },
  returns: v.object({
    claimed: v.number(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be authenticated to claim chats");

    // Find all chats with this sessionId
    const anonymousChats = await ctx.db
      .query("chats")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Update each chat to belong to the user
    for (const chat of anonymousChats) {
      await ctx.db.patch(chat._id, {
        userId,
        sessionId: undefined, // Remove session ID after claiming
        updatedAt: Date.now(),
      });
    }

    return { claimed: anonymousChats.length };
  },
});
