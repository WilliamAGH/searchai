/**
 * Message-related chat operations
 * - Fetching messages for a chat
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { query } from "../_generated/server";
import { vContextReference, vSearchResult } from "../lib/validators";
import { hasUserAccess, hasSessionAccess } from "../lib/auth";

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
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      chatId: v.id("chats"),
      role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system"),
      ),
      content: v.optional(v.string()),
      timestamp: v.optional(v.number()),
      isStreaming: v.optional(v.boolean()),
      streamedContent: v.optional(v.string()),
      thinking: v.optional(v.string()),
      searchResults: v.optional(v.array(vSearchResult)),
      sources: v.optional(v.array(v.string())),
      reasoning: v.optional(v.string()),
      contextReferences: v.optional(v.array(vContextReference)),
      workflowId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    const isSharedOrPublic =
      chat.privacy === "shared" || chat.privacy === "public";
    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner = hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isUserOwner && !isSessionOwner) {
      return [];
    }

    // Validate limit if provided - reject non-positive values to prevent
    // surprising unbounded fetches when caller expects bounded results
    if (args.limit !== undefined && args.limit <= 0) {
      throw new Error("limit must be a positive number");
    }

    // When limit is specified, fetch most recent N messages by querying desc and reversing
    // This keeps memory bounded for large chats while preserving chronological order
    let docs;
    if (args.limit) {
      const descDocs = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
        .order("desc")
        .take(args.limit);
      docs = descDocs.reverse();
    } else {
      docs = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
        .order("asc")
        .collect();
    }

    // Map to validated shape with _id for client identification
    return docs.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      chatId: m.chatId,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
      streamedContent: m.streamedContent,
      thinking: m.thinking,
      searchResults: Array.isArray(m.searchResults)
        ? m.searchResults
        : undefined,
      sources: Array.isArray(m.sources) ? m.sources : undefined,
      reasoning: m.reasoning,
      contextReferences: Array.isArray(m.contextReferences)
        ? m.contextReferences
        : undefined,
      workflowId: m.workflowId,
    }));
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
  returns: v.array(
    v.object({
      _id: v.id("messages"),
      _creationTime: v.number(),
      chatId: v.id("chats"),
      role: v.union(
        v.literal("user"),
        v.literal("assistant"),
        v.literal("system"),
      ),
      content: v.optional(v.string()),
      timestamp: v.optional(v.number()),
      isStreaming: v.optional(v.boolean()),
      streamedContent: v.optional(v.string()),
      thinking: v.optional(v.string()),
      searchResults: v.optional(v.array(vSearchResult)),
      sources: v.optional(v.array(v.string())),
      reasoning: v.optional(v.string()),
      contextReferences: v.optional(v.array(vContextReference)),
      workflowId: v.optional(v.string()),
    }),
  ),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    const isSharedOrPublic =
      chat.privacy === "shared" || chat.privacy === "public";
    const isSessionOwner = hasSessionAccess(chat, args.sessionId);

    if (!isSharedOrPublic && !isSessionOwner) {
      return [];
    }

    if (args.limit !== undefined && args.limit <= 0) {
      throw new Error("limit must be a positive number");
    }

    let docs;
    if (args.limit) {
      const descDocs = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
        .order("desc")
        .take(args.limit);
      docs = descDocs.reverse();
    } else {
      docs = await ctx.db
        .query("messages")
        .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
        .order("asc")
        .collect();
    }

    return docs.map((m) => ({
      _id: m._id,
      _creationTime: m._creationTime,
      chatId: m.chatId,
      role: m.role,
      content: m.content,
      timestamp: m.timestamp,
      isStreaming: m.isStreaming,
      streamedContent: m.streamedContent,
      thinking: m.thinking,
      searchResults: Array.isArray(m.searchResults)
        ? m.searchResults
        : undefined,
      sources: Array.isArray(m.sources) ? m.sources : undefined,
      reasoning: m.reasoning,
      contextReferences: Array.isArray(m.contextReferences)
        ? m.contextReferences
        : undefined,
      workflowId: m.workflowId,
    }));
  },
});
