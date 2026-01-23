/**
 * Chat ownership claiming operations
 * Transfers anonymous chats to authenticated users
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { generateSessionId } from "../lib/uuid";

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
    newSessionId: v.string(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be authenticated to claim chats");

    const newSessionId = generateSessionId();

    // Find all chats with this sessionId to rotate access for this session.
    const chatsForSession = await ctx.db
      .query("chats")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    let claimed = 0;

    for (const chat of chatsForSession) {
      if (!chat.userId) {
        claimed += 1;
        await ctx.db.patch(chat._id, {
          userId,
          sessionId: newSessionId,
          updatedAt: Date.now(),
        });
        continue;
      }

      if (chat.userId === userId) {
        await ctx.db.patch(chat._id, {
          sessionId: newSessionId,
          updatedAt: Date.now(),
        });
      }
    }

    return { claimed, newSessionId };
  },
});
