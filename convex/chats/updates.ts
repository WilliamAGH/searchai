/**
 * Chat update operations
 * - Title updates
 * - Privacy settings
 * - Rolling summaries
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, internalMutation } from "../_generated/server";
import { generateOpaqueId } from "./utils";

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
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

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
  },
  returns: v.object({
    shareId: v.union(v.string(), v.null()),
    publicId: v.union(v.string(), v.null()),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    // Ensure share/public IDs exist when moving to shared/public for legacy rows
    let shareId = (chat as unknown as { shareId?: string }).shareId;
    let publicId = (chat as unknown as { publicId?: string }).publicId;
    if (args.privacy === "shared" && !shareId) {
      shareId = generateOpaqueId();
    }
    if (args.privacy === "public" && !publicId) {
      publicId = generateOpaqueId();
    }

    await ctx.db.patch(args.chatId, {
      privacy: args.privacy,
      // Only set ids if newly generated (preserve existing values)
      ...(shareId && !(chat as unknown as { shareId?: string }).shareId
        ? { shareId }
        : {}),
      ...(publicId && !(chat as unknown as { publicId?: string }).publicId
        ? { publicId }
        : {}),
      updatedAt: Date.now(),
    });

    // Return identifiers so the client can update immediately without refetch
    return {
      shareId:
        shareId ?? (chat as unknown as { shareId?: string }).shareId ?? null,
      publicId:
        publicId ?? (chat as unknown as { publicId?: string }).publicId ?? null,
    };
  },
});
