import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { internalMutation, mutation } from "./_generated/server";
import { internal } from "./_generated/api";
import { vWebResearchSource, vSearchMethod } from "./lib/validators";
import { generateMessageId, generateThreadId } from "./lib/id_generator";
import { isValidWorkflowToken } from "./lib/auth";
import { hasChatWriteAccess, isHttpWriteAuthorized } from "./chats/writeAccess";
import { buildMessageInsertDocument } from "./messages_insert_document";

const messageBaseArgs = {
  chatId: v.id("chats"),
  role: v.union(v.literal("user"), v.literal("assistant")),
  content: v.optional(v.string()),
  isStreaming: v.optional(v.boolean()),
  streamedContent: v.optional(v.string()),
  thinking: v.optional(v.string()),
  reasoning: v.optional(v.string()),
  searchMethod: v.optional(vSearchMethod),
  hasRealResults: v.optional(v.boolean()),
  webResearchSources: v.optional(v.array(vWebResearchSource)),
  workflowId: v.optional(v.string()),
  imageStorageIds: v.optional(v.array(v.id("_storage"))),
  sessionId: v.optional(v.string()),
};

export const addMessage = internalMutation({
  args: { ...messageBaseArgs },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");

    if (!hasChatWriteAccess(chat, userId, args.sessionId)) {
      throw new Error(
        `Unauthorized: addMessage denied for chat ${args.chatId}`,
      );
    }

    const messageId = generateMessageId();

    let threadId = chat.threadId;
    if (!threadId) {
      threadId = generateThreadId();
      await ctx.db.patch(args.chatId, { threadId });
    }

    const { chatId, sessionId: _sessionId, ...persistableArgs } = args;
    return await ctx.db.insert(
      "messages",
      buildMessageInsertDocument({
        chatId,
        messageId,
        threadId,
        args: persistableArgs,
      }),
    );
  },
});

export const addMessageHttp = internalMutation({
  args: {
    ...messageBaseArgs,
    workflowTokenId: v.optional(v.id("workflowTokens")),
  },
  returns: v.id("messages"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");

    const workflowToken = args.workflowTokenId
      ? await ctx.db.get(args.workflowTokenId)
      : null;
    const hasValidToken = isValidWorkflowToken(workflowToken, args.chatId);
    const hasBaseAccess = hasChatWriteAccess(chat, userId, args.sessionId);
    const tokenSessionMatches =
      !workflowToken?.sessionId || workflowToken.sessionId === args.sessionId;

    if (
      !isHttpWriteAuthorized({
        hasBaseAccess,
        hasValidToken,
        tokenProvided: !!args.workflowTokenId,
        tokenSessionMatches,
      })
    ) {
      throw new Error(
        `Unauthorized: addMessageHttp denied for chat ${args.chatId}`,
      );
    }

    const messageId = generateMessageId();

    let threadId = chat.threadId;
    if (!threadId) {
      threadId = generateThreadId();
      await ctx.db.patch(args.chatId, { threadId });
    }

    const {
      chatId,
      sessionId: _sessionId,
      workflowTokenId: _workflowTokenId,
      ...persistableArgs
    } = args;
    return await ctx.db.insert(
      "messages",
      buildMessageInsertDocument({
        chatId,
        messageId,
        threadId,
        args: persistableArgs,
      }),
    );
  },
});

export const updateMessageMetadata = mutation({
  args: {
    messageId: v.id("messages"),
    searchMethod: v.optional(vSearchMethod),
    hasRealResults: v.optional(v.boolean()),
    webResearchSources: v.optional(v.array(vWebResearchSource)),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const { messageId, sessionId, ...metadata } = args;
    const message = await ctx.db.get(messageId);
    if (!message) {
      throw new Error(`Message not found: ${messageId}`);
    }

    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(message.chatId);
    if (!chat) throw new Error("Chat not found");
    if (!hasChatWriteAccess(chat, userId, sessionId)) {
      throw new Error(
        `Unauthorized: updateMessageMetadata denied for chat ${message.chatId}`,
      );
    }

    await ctx.db.patch(messageId, metadata);
    return null;
  },
});

export const updateMessage = internalMutation({
  args: {
    messageId: v.id("messages"),
    content: v.optional(v.string()),
    streamedContent: v.optional(v.string()),
    thinking: v.optional(v.string()),
    isStreaming: v.optional(v.boolean()),
    reasoning: v.optional(v.string()),
    searchMethod: v.optional(vSearchMethod),
    hasRealResults: v.optional(v.boolean()),
    webResearchSources: v.optional(v.array(vWebResearchSource)),
    workflowId: v.optional(v.string()),
  },
  handler: async (ctx, { messageId, ...rest }) => {
    await ctx.db.patch(messageId, { ...rest });
  },
});

/** Count user messages for a chat. */
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
  args: {
    messageId: v.id("messages"),
    sessionId: v.optional(v.string()),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const message = await ctx.db.get(args.messageId);
    if (!message) return null;

    const chat = await ctx.db.get(message.chatId);
    if (!chat) throw new Error("Chat not found");

    const userId = await getAuthUserId(ctx);
    if (!hasChatWriteAccess(chat, userId, args.sessionId)) {
      throw new Error(
        `Unauthorized: deleteMessage denied for chat ${message.chatId}`,
      );
    }

    await ctx.db.delete(args.messageId);

    // Schedule cache invalidation; scheduling failures should not fail delete.
    try {
      // @ts-ignore - Known Convex TS2589 type instantiation issue
      // oxlint-disable-next-line typescript-eslint/no-explicit-any -- Convex TS2589 workaround; type instantiation too deep
      const invalidatePlan: any = internal.search.invalidatePlanCacheForChat;
      await ctx.scheduler.runAfter(0, invalidatePlan, {
        chatId: message.chatId,
      });
    } catch (schedulerError) {
      // Log but don't propagate - the delete succeeded, cache invalidation is best-effort
      console.error("Failed to schedule plan cache invalidation", {
        chatId: message.chatId,
        error:
          schedulerError instanceof Error
            ? schedulerError.message
            : String(schedulerError),
      });
    }

    // Clear rolling summary - part of the same transaction, errors should propagate
    await ctx.db.patch(message.chatId, {
      rollingSummary: "",
      rollingSummaryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });

    return null;
  },
});
