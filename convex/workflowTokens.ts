import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

export const createToken = internalMutation({
  args: {
    workflowId: v.string(),
    nonce: v.string(),
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    issuedAt: v.number(),
    expiresAt: v.number(),
  },
  returns: v.id("workflowTokens"),
  handler: async (ctx, args) => {
    return await ctx.db.insert("workflowTokens", {
      workflowId: args.workflowId,
      nonce: args.nonce,
      signature: "",
      chatId: args.chatId,
      sessionId: args.sessionId,
      status: "active",
      issuedAt: args.issuedAt,
      expiresAt: args.expiresAt,
    });
  },
});

export const completeToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
    signature: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      console.error("[workflowTokens] Token not found for completion", {
        tokenId: args.tokenId,
      });
      return null;
    }
    if (token.status !== "active") {
      console.warn("[workflowTokens] Token not in active state", {
        tokenId: args.tokenId,
        currentStatus: token.status,
      });
      return null;
    }
    await ctx.db.patch(args.tokenId, {
      signature: args.signature,
      status: "completed",
    });
    return null;
  },
});

export const invalidateToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const token = await ctx.db.get(args.tokenId);
    if (!token) {
      console.error("[workflowTokens] Token not found for invalidation", {
        tokenId: args.tokenId,
      });
      return null;
    }
    if (token.status !== "active") {
      return null;
    }
    await ctx.db.patch(args.tokenId, { status: "invalidated" });
    return null;
  },
});
