/**
 * Anonymous chat operations
 * Handles chats for unauthenticated users using session IDs
 */

import { v } from "convex/values";
import { mutation, query } from "../_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { debugStart, debugEnd } from "../lib/debug";

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
    debugStart("chats.anonymous.createAnonymousChat");
    const userId = await getAuthUserId(ctx);

    // If user is authenticated, use their ID; otherwise use sessionId
    const now = Date.now();

    const id = await ctx.db.insert("chats", {
      title: args.title,
      userId: userId || undefined,
      sessionId: !userId ? args.sessionId : undefined,
      privacy: "private",
      createdAt: now,
      updatedAt: now,
    });
    debugEnd("chats.anonymous.createAnonymousChat", { id });
    return id;
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
  returns: v.array(
    v.object({
      _id: v.id("chats"),
      _creationTime: v.number(),
      title: v.string(),
      createdAt: v.number(),
      updatedAt: v.number(),
      privacy: v.optional(
        v.union(v.literal("private"), v.literal("shared"), v.literal("public")),
      ),
      userId: v.optional(v.id("users")),
      sessionId: v.optional(v.string()),
      shareId: v.optional(v.string()),
      publicId: v.optional(v.string()),
      rollingSummary: v.optional(v.string()),
      rollingSummaryUpdatedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    debugStart("chats.anonymous.getAnonymousChats");
    const userId = await getAuthUserId(ctx);

    if (userId) {
      // If authenticated, return user's chats
      const result = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
      debugEnd("chats.anonymous.getAnonymousChats", { count: result.length });
      return result;
    } else {
      // Return chats for this session
      const result = await ctx.db
        .query("chats")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .collect();
      debugEnd("chats.anonymous.getAnonymousChats", { count: result.length });
      return result;
    }
  },
});
