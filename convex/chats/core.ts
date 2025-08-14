/**
 * Core chat CRUD operations
 * - Chat creation and retrieval
 * - Ownership validation
 * - Share ID lookups
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query, mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateShareId, generatePublicId } from "../lib/uuid";

/**
 * Create new chat
 * - Generates unique share ID
 * - Works for both authenticated and anonymous users
 * - Sets timestamps
 * @param title - Chat title
 * @param sessionId - Optional session ID for anonymous users
 * @returns Chat ID
 */
export const createChat = mutation({
  args: {
    title: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.id("chats"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    // Generate UUID v7 IDs for time-sortable, collision-resistant identifiers
    const shareId = generateShareId();
    const publicId = generatePublicId();

    return await ctx.db.insert("chats", {
      title: args.title,
      userId: userId || undefined,
      sessionId: !userId ? args.sessionId : undefined,
      shareId,
      publicId,
      privacy: "private",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get user's chats
 * - Returns chats for authenticated users OR anonymous session
 * - Ordered by creation desc
 * @param sessionId - Optional session ID for anonymous users
 * @returns Array of user's chats
 */
export const getUserChats = query({
  args: {
    sessionId: v.optional(v.string()),
  },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);

    // Authenticated users - return their chats
    if (userId) {
      return await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .order("desc")
        .collect();
    }

    // Anonymous users - return session chats
    if (args.sessionId) {
      return await ctx.db
        .query("chats")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .collect();
    }

    // No userId or sessionId - return empty
    return [];
  },
});

/**
 * Get chat by ID
 * - Validates ownership
 * - Allows anonymous chats
 * @param chatId - Chat database ID
 * @returns Chat or null
 */
export const getChatById = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return null;

    return chat;
  },
});

/**
 * Alias for getChatById to maintain frontend compatibility
 * @param chatId - Chat database ID
 * @returns Chat or null
 */
export const getChat = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    // Alias to getChatById for frontend compatibility
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return null;

    return chat;
  },
});

export const getChatByOpaqueId = query({
  args: { opaqueId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    // Treat the opaque ID string as a Convex chat ID
    const chatId = args.opaqueId as Id<"chats">;
    const chat = await ctx.db.get(chatId);

    if (!chat) return null;

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return null;

    return chat;
  },
});

/**
 * Get chat by share ID
 * - For shareable URLs
 * - Checks sharing permissions
 * @returns Chat or null
 */
export const getChatByShareId = query({
  args: { shareId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .unique();

    if (!chat) return null;

    // Only return shared or public chats
    if (chat.privacy !== "shared" && chat.privacy !== "public") {
      const userId = await getAuthUserId(ctx);
      if (chat.userId !== userId) return null;
    }

    return chat;
  },
});

export const getChatByPublicId = query({
  args: { publicId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!chat) return null;

    if (chat.privacy !== "public") {
      return null;
    }

    return chat;
  },
});
