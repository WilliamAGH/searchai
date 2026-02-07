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
import type { QueryCtx, MutationCtx } from "../_generated/server";
import { generateShareId, generatePublicId } from "../lib/uuid";
import {
  hasUserAccess,
  hasSessionAccess,
  isValidWorkflowToken,
} from "../lib/auth";

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
    // Validate sessionId if provided - reject empty strings
    if (args.sessionId !== undefined && args.sessionId.trim() === "") {
      throw new Error("sessionId cannot be an empty string");
    }

    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    if (!userId && !args.sessionId) {
      throw new Error("sessionId is required for anonymous chats");
    }

    // Generate UUID v7 IDs for time-sortable, collision-resistant identifiers
    const shareId = generateShareId();
    const publicId = generatePublicId();

    return await ctx.db.insert("chats", {
      title: args.title,
      userId: userId || undefined,
      // CRITICAL: Always set sessionId if provided, even for authenticated users
      // Reason: HTTP endpoints lack Convex auth context and validate via sessionId
      // Having both userId and sessionId enables access via both Convex queries (userId)
      // and HTTP actions (sessionId)
      sessionId: args.sessionId,
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
      const chats = await ctx.db
        .query("chats")
        .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
        .order("desc")
        .collect();
      return chats.filter((chat) => !chat.userId);
    }

    // No userId or sessionId - return empty
    return [];
  },
});

/**
 * Helper function to validate chat access
 * Supports dual ownership: chats can have both userId AND sessionId
 * This enables access via:
 * 1. Convex queries/mutations (use userId from auth context)
 * 2. HTTP endpoints (use sessionId, since httpAction has no auth context)
 */
async function validateChatAccess(
  ctx: QueryCtx | MutationCtx,
  chatId: Id<"chats">,
  sessionId?: string,
) {
  const userId = await getAuthUserId(ctx);
  const chat = await ctx.db.get(chatId);

  if (!chat) return null;

  // Shared and public chats are accessible regardless of owner or session
  if (chat.privacy === "shared" || chat.privacy === "public") {
    return chat;
  }

  // For authenticated users: check userId matches (Convex queries/mutations)
  if (hasUserAccess(chat, userId)) {
    return chat;
  }

  // For sessionId-based access: HTTP endpoints or anonymous users
  // Note: HTTP actions don't have auth context, so they rely on sessionId
  if (!chat.userId && hasSessionAccess(chat, sessionId)) {
    return chat;
  }

  // No valid access path
  // SECURITY: Reject chats without proper ownership (userId or sessionId)
  // If a chat has neither, it's a data integrity issue that should not grant access
  return null;
}

/**
 * Get chat by ID
 * - Validates ownership for authenticated users
 * - Validates sessionId for anonymous users
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 * @returns Chat or null
 */
export const getChatById = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    return await validateChatAccess(ctx, args.chatId, args.sessionId);
  },
});

/**
 * Get chat by ID for HTTP routes (no auth context).
 * - Allows shared/public chats
 * - Allows sessionId ownership (anonymous chats only)
 * - Allows valid workflow token (for authenticated user streaming workflows)
 */
export const getChatByIdHttp = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    workflowTokenId: v.optional(v.id("workflowTokens")),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return null;

    if (chat.privacy === "shared" || chat.privacy === "public") {
      return chat;
    }

    if (!chat.userId && hasSessionAccess(chat, args.sessionId)) {
      return chat;
    }

    const token = args.workflowTokenId
      ? await ctx.db.get(args.workflowTokenId)
      : null;
    if (isValidWorkflowToken(token, args.chatId)) {
      return chat;
    }

    return null;
  },
});

/**
 * Get chat by ID with direct database lookup (bypasses indexes)
 * Use this immediately after creation to avoid index propagation delays
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 * @returns Chat or null
 */
export const getChatByIdDirect = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    // Direct lookup bypasses index - use for immediate post-creation reads
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    const userId = await getAuthUserId(ctx);

    const isSharedOrPublic =
      chat.privacy === "shared" || chat.privacy === "public";
    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);

    if (isSharedOrPublic || isUserOwner || isSessionOwner) {
      return chat;
    }

    // SECURITY: Reject chats without proper ownership (userId or sessionId)
    return null;
  },
});

/**
 * Alias for getChatById to maintain frontend compatibility
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 * @returns Chat or null
 */
export const getChat = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    // Reuse validation logic
    return await validateChatAccess(ctx, args.chatId, args.sessionId);
  },
});

export const getChatByOpaqueId = query({
  args: {
    opaqueId: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chatId = ctx.db.normalizeId("chats", args.opaqueId);

    if (!chatId) {
      return null;
    }

    return await validateChatAccess(ctx, chatId, args.sessionId);
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
      if (!hasUserAccess(chat, userId)) return null;
    }

    return chat;
  },
});

/**
 * Get chat by share ID for HTTP routes (no auth context).
 * - Only returns shared/public chats
 */
export const getChatByShareIdHttp = query({
  args: { shareId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .unique();

    if (!chat) return null;

    if (chat.privacy !== "shared" && chat.privacy !== "public") {
      return null;
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
