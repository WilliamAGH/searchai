/**
 * Chat subscription functions
 * - Real-time updates for chat state
 * - Message streaming updates
 * - Presence and typing indicators
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import type { Doc } from "../_generated/dataModel";

/**
 * Subscribe to chat updates
 * - Real-time chat and message updates
 * - Streaming state monitoring
 * @param chatId - Chat database ID
 * @returns Chat state with messages
 */
export const subscribeToChatUpdates = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(
    v.null(),
    v.object({
      chat: v.any(),
      messages: v.array(v.any()),
      isGenerating: v.boolean(),
      streamedContent: v.optional(v.string()),
      rollingSummary: v.optional(v.string()),
      lastUpdated: v.number(),
      streamingState: v.union(
        v.null(),
        v.object({
          messageId: v.id("messages"),
          isStreaming: v.boolean(),
          content: v.optional(v.string()),
          streamedContent: v.optional(v.string()),
          thinking: v.optional(v.string()),
        }),
      ),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    // Check access permissions
    const privacy = (chat as Doc<"chats">).privacy;
    const isSharedOrPublic = privacy === "shared" || privacy === "public";

    // Allow access to:
    // - Owner's chats (authenticated)
    // - Anonymous chats with matching sessionId
    // - Publicly shared chats
    if (chat.userId && chat.userId !== userId && !isSharedOrPublic) {
      return null;
    }

    // For anonymous chats, verify sessionId matches
    if (!chat.userId && chat.sessionId && chat.sessionId !== args.sessionId) {
      return null;
    }

    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();

    // Find the most recent streaming message (if any)
    let streamingMessage: Doc<"messages"> | undefined;
    for (let i = messages.length - 1; i >= 0; i--) {
      const m = messages[i] as Doc<"messages">;
      if (m.isStreaming === true) {
        streamingMessage = m;
        break;
      }
    }

    return {
      chat,
      messages,
      isGenerating: !!streamingMessage,
      streamedContent: streamingMessage?.streamedContent || undefined,
      rollingSummary: chat.rollingSummary,
      lastUpdated: Date.now(),
      // NEW: Add streaming state for real-time updates
      streamingState: streamingMessage
        ? {
            messageId: streamingMessage._id,
            isStreaming: true,
            content: streamingMessage.content,
            streamedContent: streamingMessage.streamedContent,
            thinking: streamingMessage.thinking,
            // Note: searchProgress field doesn't exist in schema
          }
        : null,
    };
  },
});

/**
 * Subscribe to streaming updates for a specific message
 * - Used during AI response generation
 * @param messageId - Message database ID
 * @returns Streaming content and status
 */
export const subscribeToMessageStream = query({
  args: { messageId: v.id("messages") },
  returns: v.union(
    v.null(),
    v.object({
      messageId: v.id("messages"),
      content: v.optional(v.string()),
      streamedContent: v.optional(v.string()),
      isStreaming: v.boolean(),
      thinking: v.optional(v.string()),
      completedAt: v.optional(v.number()),
    }),
  ),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    return {
      messageId: args.messageId,
      content: message.content,
      streamedContent: message.streamedContent,
      isStreaming: !!message.isStreaming,
      thinking: message.thinking,
      completedAt: undefined,
    };
  },
});

// Placeholder for future subscription functions
// These will be implemented in Phase 3
