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

    // Find any streaming message
    const streamingMessage = messages.find(
      (m: Doc<"messages">) => m.isStreaming === true,
    );

    return {
      chat,
      messages,
      isGenerating: false, // The chat entity doesn't have isStreaming field
      streamedContent: streamingMessage?.streamedContent || undefined,
      rollingSummary: chat.rollingSummary,
      lastUpdated: Date.now(),
      // NEW: Add streaming state for real-time updates
      streamingState: streamingMessage ? {
        messageId: streamingMessage._id,
        isStreaming: true,
        content: streamingMessage.content,
        streamedContent: streamingMessage.streamedContent,
        thinking: streamingMessage.thinking,
        searchProgress: streamingMessage.searchProgress,
      } : null,
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
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    return {
      messageId: args.messageId,
      content: message.content,
      streamedContent: message.streamedContent,
      isStreaming: message.isStreaming || false,
      completedAt: undefined, // This field doesn't exist in the schema
    };
  },
});

// Placeholder for future subscription functions
// These will be implemented in Phase 3
