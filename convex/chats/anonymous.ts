/**
 * Anonymous chat operations
 * Handles chats for unauthenticated users using session IDs
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

/**
 * Create an anonymous chat
 * @param title - Chat title
 * @param sessionId - Anonymous session identifier
 * @returns Chat ID
 */
export const createAnonymousChat = mutation({
  args: {
    title: v.string(),
    sessionId: v.string(),
  },
  returns: v.id("chats"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // If user is authenticated, use their ID; otherwise use sessionId
    const now = Date.now();

    return await ctx.db.insert("chats", {
      title: args.title,
      userId: userId || undefined,
      sessionId: !userId ? args.sessionId : undefined,
      privacy: "private",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get chats for anonymous session
 * @param sessionId - Anonymous session identifier
 * @returns Array of chats for this session
 */
export const getAnonymousChats = query({
  args: {
    sessionId: v.string(),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    if (userId) {
      // If authenticated, return user's chats
      return await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    } else {
      // Return chats for this session
      return await ctx.db
        .query("chats")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .collect();
    }
  },
});

/**
 * Claim anonymous chats when user signs up
 * Transfers ownership of session chats to authenticated user
 * @param sessionId - Anonymous session to claim
 */
export const claimAnonymousChats = mutation({
  args: {
    sessionId: v.string(),
  },
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
        sessionId: undefined, // Remove session ID
        updatedAt: Date.now(),
      });
    }

    return { claimed: anonymousChats.length };
  },
});
