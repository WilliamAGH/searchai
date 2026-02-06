/**
 * Message-related chat operations
 * - Fetching messages for a chat
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { hasUserAccess, hasSessionAccess } from "../lib/auth";
import {
  fetchMessagesByChatId,
  projectMessage,
  vMessageProjection,
} from "./messageProjection";

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @param sessionId - Optional session ID for anonymous users
 * @returns Array of messages
 */
export const getChatMessages = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(vMessageProjection),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    const isSharedOrPublic =
      chat.privacy === "shared" || chat.privacy === "public";
    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isUserOwner && !isSessionOwner) {
      return [];
    }

    const docs = await fetchMessagesByChatId(ctx.db, args.chatId, args.limit);
    return docs.map(projectMessage);
  },
});

/**
 * Get chat messages for HTTP routes (no auth context).
 * - Allows shared/public chats
 * - Allows sessionId ownership
 */
export const getChatMessagesHttp = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.array(vMessageProjection),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    const isSharedOrPublic =
      chat.privacy === "shared" || chat.privacy === "public";
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isSessionOwner) {
      return [];
    }

    const docs = await fetchMessagesByChatId(ctx.db, args.chatId, args.limit);
    return docs.map(projectMessage);
  },
});
