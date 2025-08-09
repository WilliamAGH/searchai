import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createChat = mutation({
	args: {
		title: v.string(),
		shareId: v.optional(v.string()),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const now = Date.now();

		// Generate unique share ID if not provided
		const shareId =
			args.shareId ||
			Math.random().toString(36).substring(2, 15) +
				Math.random().toString(36).substring(2, 15);

		return await ctx.db.insert("chats", {
			title: args.title,
			userId: userId || undefined,
			shareId,
			createdAt: now,
			updatedAt: now,
		});
	},
});

export const getUserChats = query({
	args: {},
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

export const getChatById = query({
	args: { chatId: v.id("chats") },
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) return null;

		// Allow access to chats without userId (anonymous chats) or user's own chats
		if (chat.userId && chat.userId !== userId) return null;

		return chat;
	},
});

export const getChatByShareId = query({
	args: { shareId: v.string() },
	handler: async (ctx, args) => {
		const chat = await ctx.db
			.query("chats")
			.withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
			.first();

		if (!chat || !chat.shareId) return null;

		// Only return shared chats or user's own chats
		const userId = await getAuthUserId(ctx);
		if (!chat.isShared && chat.userId !== userId) return null;

		return chat;
	},
});

export const getChatMessages = query({
	args: { chatId: v.id("chats") },
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

export const updateChatTitle = mutation({
	args: {
		chatId: v.id("chats"),
		title: v.string(),
	},
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

export const shareChat = mutation({
	args: {
		chatId: v.id("chats"),
		isPublic: v.boolean(),
	},
	handler: async (ctx, args) => {
		const userId = await getAuthUserId(ctx);
		const chat = await ctx.db.get(args.chatId);

		if (!chat) throw new Error("Chat not found");
		if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

		await ctx.db.patch(args.chatId, {
			isShared: true,
			isPublic: args.isPublic,
			updatedAt: Date.now(),
		});
	},
});

export const deleteChat = mutation({
	args: { chatId: v.id("chats") },
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
