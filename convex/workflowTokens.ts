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
    await ctx.db.patch(args.tokenId, {
      signature: args.signature,
      status: "completed",
    });
  },
});

export const invalidateToken = internalMutation({
  args: {
    tokenId: v.id("workflowTokens"),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    await ctx.db.patch(args.tokenId, { status: "invalidated" });
  },
});
