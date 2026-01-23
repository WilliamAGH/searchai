/**
 * Chat summarization operations
 * - Build compact summaries for context reduction
 * - Query and action wrappers for summary generation
 */

import { v } from "convex/values";
import { getAuthUserId } from "@convex-dev/auth/server";
import { query, action } from "../_generated/server";
import { buildContextSummary } from "./utils";

/**
 * Summarize last N messages (cheap, server-side)
 * - Returns a compact bullet summary for bootstrapping a new chat
 */
export const summarizeRecent = query({
  args: {
    chatId: v.id("chats"),
    limit: v.optional(v.number()),
    sessionId: v.optional(v.string()),
  },
  returns: v.string(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 14, 40));
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return "";

    const userId = await getAuthUserId(ctx);

    // Shared and public chats are accessible regardless of owner or session
    if (chat.privacy !== "shared" && chat.privacy !== "public") {
      const isUserOwner = chat.userId && userId && chat.userId === userId;
      const isSessionOwner =
        chat.sessionId && args.sessionId && chat.sessionId === args.sessionId;

      if (!isUserOwner && !isSessionOwner) {
        return "";
      }
    }

    const q = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc");
    const buf: Array<{
      role: "user" | "assistant" | "system";
      content?: string;
      timestamp?: number;
    }> = [];
    for await (const m of q) {
      buf.push(m);
      if (buf.length >= limit) break;
    }
    const ordered = buf.reverse();
    return buildContextSummary({
      messages: ordered,
      rollingSummary: (chat as unknown as { rollingSummary?: string })
        ?.rollingSummary,
      maxChars: 1600,
    });
  },
});

/**
 * Action wrapper to build a compact summary (calls query under the hood)
 * - Allows clients to request a summary imperatively
 */
export const summarizeRecentAction = action({
  args: { chatId: v.id("chats"), limit: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const lim = Math.max(1, Math.min(args.limit ?? 14, 40));
    // Load messages via query to respect auth and avoid using ctx.db in actions
    // Import functions directly to avoid circular dependency
    const { getChatMessages } = await import("./messages");
    const { getChatById } = await import("./core");

    const all = await ctx.runQuery(getChatMessages as any, {
      chatId: args.chatId,
    });
    const ordered = all.slice(-lim);
    // Break type circularity by annotating the query result as unknown
    const chatResult: unknown = await ctx.runQuery(getChatById as any, {
      chatId: args.chatId,
    });
    return buildContextSummary({
      messages: ordered,
      rollingSummary: (
        chatResult as { rollingSummary?: string } | null | undefined
      )?.rollingSummary,
      maxChars: 1600,
    });
  },
});
