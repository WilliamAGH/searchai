import { v } from "convex/values";
import { mutation, action } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";

export const addMessage = mutation({
  args: {
    chatId: v.id("chats"),
    role: v.union(v.literal("user"), v.literal("assistant")),
    content: v.string(),
    searchResults: v.optional(v.array(v.object({
      title: v.string(),
      url: v.string(),
      snippet: v.string(),
      relevanceScore: v.optional(v.number()),
    }))),
    sources: v.optional(v.array(v.string())),
    reasoning: v.optional(v.string()), // Add reasoning tokens field
    searchMethod: v.optional(v.union(v.literal("serp"), v.literal("openrouter"), v.literal("duckduckgo"), v.literal("fallback"))),
    hasRealResults: v.optional(v.boolean()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    
    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");
    
    return await ctx.db.insert("messages", {
      chatId: args.chatId,
      role: args.role,
      content: args.content,
      searchResults: args.searchResults,
      sources: args.sources,
      reasoning: args.reasoning,
      searchMethod: args.searchMethod,
      hasRealResults: args.hasRealResults,
      timestamp: Date.now(),
    });
  },
});
