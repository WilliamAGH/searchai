import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";

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
          relevanceScore: v.number(), // Required to match schema
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
          relevanceScore: v.number(), // Required to match schema
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
          relevanceScore: v.number(), // Required to match schema
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
    // TODO: Re-enable cache invalidation when circular dependency is resolved
    // try {
    //   await ctx.scheduler.runAfter(
    //     0,
    //     internal.search.invalidatePlanCacheForChat,
    //     {
    //       chatId: message.chatId,
    //     },
    //   );
    // } catch {}

    // Clear rolling summary directly to avoid circular dependency
    try {
      await ctx.db.patch(message.chatId, {
        rollingSummary: "",
        rollingSummaryUpdatedAt: Date.now(),
        updatedAt: Date.now(),
      });
    } catch {}
    return null;
  },
});

export const addMessageWithTransaction = internalMutation({
  args: {
    chatId: v.id("chats"),
    userMessage: v.string(),
    isReplyToAssistant: v.optional(v.boolean()),
  },
  returns: v.object({
    success: v.boolean(),
    assistantMessageId: v.optional(v.id("messages")),
    error: v.optional(v.string()),
  }),
  handler: async (ctx, args) => {
    try {
      const chat = await ctx.db.get(args.chatId);
      if (!chat) {
        return { success: false, error: "Chat not found" };
      }

      const messages = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
        .collect();

      const userMessageCount = messages.filter((m) => m.role === "user").length;

      // Add user message
      await ctx.db.insert("messages", {
        chatId: args.chatId,
        role: "user",
        content: args.userMessage,
        timestamp: Date.now(),
      });

      // Update title only for first user message
      if (userMessageCount === 0 && !args.isReplyToAssistant) {
        const title =
          args.userMessage.length > 50
            ? `${args.userMessage.substring(0, 50)}...`
            : args.userMessage;

        await ctx.db.patch(args.chatId, {
          title,
          updatedAt: Date.now(),
        });
      }

      // Create assistant placeholder
      const assistantMessageId = await ctx.db.insert("messages", {
        chatId: args.chatId,
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: Date.now(),
      });

      return { success: true, assistantMessageId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  },
});
