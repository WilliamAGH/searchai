/**
 * Chat update operations
 * - Title updates
 * - Privacy settings
 * - Rolling summaries
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { hasPrimaryOwnerAccess } from "../lib/auth";
import { generateShareId, generatePublicId } from "../lib/uuid";

/**
 * Update chat title
 * - Validates ownership
 * - Updates timestamp
 * @param chatId - Chat database ID
 * @param title - New title
 */
export const updateChatTitle = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (!hasPrimaryOwnerAccess(chat, userId, args.sessionId)) {
      throw new Error("Unauthorized");
    }

    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

// Internal version for use within actions
export const internalUpdateChatTitle = internalMutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update rolling summary for a chat
 * - Compact summary of latest context (<= ~1-2KB)
 * - Used by planner to shrink tokens
 */
export const updateRollingSummary = internalMutation({
  args: {
    chatId: v.id("chats"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.chatId, {
      rollingSummary: args.summary.slice(0, 2000),
      rollingSummaryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Share chat publicly/privately
 * - Sets sharing flags
 * - Validates ownership
 * @param chatId - Chat database ID
 * @param isPublic - Public visibility
 */
export const updateChatPrivacy = mutation({
  args: {
    chatId: v.id("chats"),
    privacy: v.union(
      v.literal("private"),
      v.literal("shared"),
      v.literal("public"),
    ),
    sessionId: v.optional(v.string()),
  },
  returns: v.object({
    shareId: v.union(v.string(), v.null()),
    publicId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (!hasPrimaryOwnerAccess(chat, userId, args.sessionId)) {
      throw new Error("Unauthorized");
    }

    // Ensure share/public IDs exist when moving to shared/public for legacy rows
    let shareId = chat.shareId;
    let publicId = chat.publicId;
    if (args.privacy === "shared" && !shareId) {
      shareId = generateShareId();
    }
    if (args.privacy === "public" && !publicId) {
      publicId = generatePublicId();
    }

    await ctx.db.patch(args.chatId, {
      privacy: args.privacy,
      // Only set ids if newly generated (preserve existing values)
      ...(shareId && !chat.shareId ? { shareId } : {}),
      ...(publicId && !chat.publicId ? { publicId } : {}),
      updatedAt: Date.now(),
    });

    // Return identifiers so the client can update immediately without refetch
    return {
      shareId: shareId ?? chat.shareId ?? null,
      publicId: publicId ?? chat.publicId ?? null,
    };
  },
});
