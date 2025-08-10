/**
 * Chat management functions
 * - CRUD operations for chats/messages
 * - Share ID generation and lookup
 * - Auth-based access control
 * - Rolling summary for context compression
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { randomBytes, randomUUID } from "node:crypto";
import { v } from "convex/values";
import { action, mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

/**
 * Create new chat
 * - Generates unique share ID
 * - Associates with authenticated user
 * - Sets timestamps
 * @param title - Chat title
 * @param shareId - Optional custom share ID
 * @returns Chat ID
 */

export const createChat = mutation({
	args: {
		title: v.string(),
	},
  returns: v.id("chats"),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();

		// Use strong, URL-safe IDs instead of Math.random
		const shareId = (typeof randomUUID === 'function' ? randomUUID() : randomBytes(16).toString('hex')).replace(/-/g, '');
		const publicId = (typeof randomUUID === 'function' ? randomUUID() : randomBytes(16).toString('hex')).replace(/-/g, '');

    return await ctx.db.insert("chats", {
			title: args.title,
			userId: userId || undefined,
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
 * - Returns empty for unauth users
 * - Ordered by creation desc
 * @returns Array of user's chats
 */
export const getUserChats = query({
	args: {},
  returns: v.array(v.any()),
	handler: async (ctx) => {
		const userId = await getAuthUserId(ctx);

		// Return empty array for unauthenticated users - they'll use local storage
		if (!userId) return [];

		return await ctx.db
			.query("chats")
			.withIndex("by_user", (q) => q.eq("userId", userId))
			.order("desc")
			.collect();
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

export const getChatByOpaqueId = query({
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
 * Get chat by share ID
 * - For shareable URLs
 * - Checks sharing permissions
 * @param shareId - Unique share identifier
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

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @returns Array of messages
 */
export const getChatMessages = query({
	args: { chatId: v.id("chats") },
  returns: v.array(v.any()),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) return [];

		// Allow access to chats without userId (anonymous chats) or user's own chats
		if (chat.userId && chat.userId !== userId) return [];

		return await ctx.db
			.query("messages")
			.withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
			.order("asc")
			.collect();
	},
});

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
 * Summarize last N messages (cheap, server-side)
 * - Returns a compact bullet summary for bootstrapping a new chat
 */
export const summarizeRecent = query({
  args: { chatId: v.id("chats"), limit: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 12, 40));
    const q = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc");
    const buf: any[] = [];
    for await (const m of q) {
      buf.push(m);
      if (buf.length >= limit) break;
    }
    const ordered = buf.reverse();
    const lines: string[] = [];
    for (const m of ordered) {
      const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
      const txt = (m.content || '').replace(/\s+/g, ' ').trim();
      if (txt) lines.push(`- ${role}: ${txt.slice(0, 220)}`);
      if (lines.length >= 12) break;
    }
    return lines.join("\n");
  },
});

/**
 * Action wrapper to build a compact summary (calls query under the hood)
 * - Allows clients to request a summary imperatively
 */
export const summarizeRecentAction = action({
  args: { chatId: v.id("chats"), limit: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const lim = Math.max(1, Math.min(args.limit ?? 12, 40));
    // Load messages via query to respect auth and avoid using ctx.db in actions
    const all: Array<{
      role: 'user' | 'assistant' | 'system';
      content?: string;
      timestamp?: number;
    }> = await ctx.runQuery(api.chats.getChatMessages, { chatId: args.chatId });
    const ordered = all.slice(-lim);
    const lines: string[] = [];
    for (const m of ordered) {
      const role = m.role === 'assistant' ? 'Assistant' : m.role === 'user' ? 'User' : 'System';
      const txt = (m.content || '').replace(/\s+/g, ' ').trim();
      if (txt) lines.push(`- ${role}: ${txt.slice(0, 220)}`);
      if (lines.length >= 12) break;
    }
    return lines.join("\n");
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
		privacy: v.union(v.literal("private"), v.literal("shared"), v.literal("public")),
	},
  returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) throw new Error("Chat not found");
		if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

		await ctx.db.patch(args.chatId, {
			privacy: args.privacy,
			updatedAt: Date.now(),
		});
	},
});

/**
 * Delete chat and messages
 * - Cascades to all messages
 * - Validates ownership
 * @param chatId - Chat database ID
 */
export const deleteChat = mutation({
	args: { chatId: v.id("chats") },
  returns: v.null(),
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) throw new Error("Chat not found");
		if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

		// Delete all messages in the chat
		const messages = await ctx.db
			.query("messages")
			.withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
			.collect();

		for (const message of messages) {
			await ctx.db.delete(message._id);
		}

		await ctx.db.delete(args.chatId);
	},
});
