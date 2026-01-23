/**
 * Chat ownership claiming operations
 * Transfers anonymous chats to authenticated users
 */

import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
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

    // Find all chats with this sessionId
    const chatsForSession = await ctx.db
      .query("chats")
      .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
      .collect();

    // Filter to chats we can process: unclaimed OR already owned by this user
    const processableChats = chatsForSession.filter((chat) => {
      const isUnclaimed = !chat.userId;
      const isOwnedByUser = chat.userId === userId;
      return isUnclaimed || isOwnedByUser;
    });

    // Check if there are any unclaimed chats that need claiming
    const unclaimedChats = processableChats.filter((chat) => !chat.userId);

    // If no unclaimed chats, skip rotation entirely to avoid redundant writes
    // This prevents session rotation on every login for users with no new chats to claim
    if (unclaimedChats.length === 0) {
      return { claimed: 0, newSessionId: args.sessionId };
    }

    // Only generate new sessionId when we actually need to claim chats
    const newSessionId = generateSessionId();
    let claimed = 0;

    for (const chat of processableChats) {
      const isUnclaimed = !chat.userId;

      // Single patch: rotate sessionId; claim ownership if unclaimed
      const patchData: {
        sessionId: string;
        updatedAt: number;
        userId?: Id<"users">;
      } = {
        sessionId: newSessionId,
        updatedAt: Date.now(),
      };
      if (isUnclaimed) {
        patchData.userId = userId;
        claimed += 1;
      }
      await ctx.db.patch(chat._id, patchData);
    }

    return { claimed, newSessionId };
  },
});
