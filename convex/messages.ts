import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";

export const addMessage = internalMutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.optional(v.string()),
    isStreaming: v.optional(v.boolean()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    searchResults: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          snippet: v.string(),
          relevanceScore: v.optional(v.number()),
        }),
      ),
    ),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.string()),
    searchMethod: v.optional(
      v.union(
        v.literal("serp"),
        v.literal("openrouter"),
        v.literal("duckduckgo"),
        v.literal("fallback"),
      ),
    ),
    hasRealResults: v.optional(v.boolean()),
    hasStartedContent: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    const { chatId, ...rest } = args;
    return await ctx.db.insert("messages", {
      chatId: chatId,
      ...rest,
      timestamp: Date.now(),
    });
  },
});

export const internalUpdateMessageContent = internalMutation({
  args: {
    messageId: v.id("messages"),
    contentChunk: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      // Silently fail, to avoid crashing the stream
      console.warn(
        `Message not found: ${args.messageId}, could not append chunk.`,
      );
      return;
    }
    await ctx.db.patch(args.messageId, {
      content: (message.content || "") + args.contentChunk,
    });
  },
});

export const internalUpdateMessageReasoning = internalMutation({
  args: {
    messageId: v.id("messages"),
    reasoningChunk: v.string(),
  },
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) {
      // Silently fail, to avoid crashing the stream
      console.warn(
        `Message not found: ${args.messageId}, could not append reasoning chunk.`,
      );
      return;
    }
    await ctx.db.patch(args.messageId, {
      reasoning: (message.reasoning || "") + args.reasoningChunk,
    });
  },
});

export const updateMessageMetadata = mutation({
  args: {
    messageId: v.id("messages"),
    searchResults: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          snippet: v.string(),
          relevanceScore: v.optional(v.number()),
        }),
      ),
    ),
    sources: v.optional(v.array(v.string())),
    searchMethod: v.optional(
      v.union(
        v.literal("serp"),
        v.literal("openrouter"),
        v.literal("duckduckgo"),
        v.literal("fallback"),
      ),
    ),
    hasRealResults: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const { messageId, ...metadata } = args;
    const message = await ctx.db.get(messageId);
    if (!message) {
      // Silently fail
      console.warn(
        `Message not found: ${messageId}, could not update metadata.`,
      );
      return;
    }
    await ctx.db.patch(messageId, metadata);
  },
});

export const updateMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    isStreaming: v.optional(v.boolean()),
    searchResults: v.optional(
      v.array(
        v.object({
          title: v.string(),
          url: v.string(),
          snippet: v.string(),
          relevanceScore: v.optional(v.number()),
        }),
      ),
    ),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.string()),
    searchMethod: v.optional(
      v.union(
        v.literal("serp"),
        v.literal("openrouter"),
        v.literal("duckduckgo"),
        v.literal("fallback"),
      ),
    ),
    hasRealResults: v.optional(v.boolean()),
    hasStartedContent: v.optional(v.boolean()),
  },
  handler: async (ctx, { messageId, ...rest }) => {
    await ctx.db.patch(messageId, { ...rest });
  },
});

/**
 * Delete a single message from a chat
 * - Validates ownership via chat.userId
 * - Removes the message
 * - Invalidates planner cache and rolling summary (clears summary text)
 */
/**
 * Count messages for a chat
 * Used to determine if title should be generated
 */
export const countMessages = internalMutation({
  args: { chatId: v.id("chats") },
  returns: v.number(),
  handler: async (ctx, args) => {
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .filter((q) => q.eq(q.field("role"), "user"))
      .collect();
    return messages.length;
  },
});

export const deleteMessage = mutation({
  args: { messageId: v.id("messages") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;
    const chat = await ctx.db.get(message.chatId);
    const userId = await getAuthUserId(ctx);
    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.delete(args.messageId);

    // Best-effort: invalidate planner cache and clear rolling summary to force regeneration
    try {
      await ctx.scheduler.runAfter(
        0,
        internal.search.invalidatePlanCacheForChat,
        {
          chatId: message.chatId,
        },
      );
    } catch {}
    try {
      await ctx.runMutation(internal.chats.updateRollingSummary, {
        chatId: message.chatId,
        summary: "",
      });
    } catch {}
    return null;
  },
});
