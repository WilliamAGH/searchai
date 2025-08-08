import { v } from "convex/values";
import { query, mutation } from "./_generated/server";
import { getAuthUserId } from "@convex-dev/auth/server";
import { api } from "./_generated/api";

export const getUserPreferences = query({
  args: {},
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) return null;
    
    const prefs = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    
    return prefs || {
      theme: "system" as const,
      searchEnabled: true,
      maxSearchResults: 5,
    };
  },
});

export const updateUserPreferences = mutation({
  args: {
    theme: v.optional(v.union(v.literal("light"), v.literal("dark"), v.literal("system"))),
    searchEnabled: v.optional(v.boolean()),
    maxSearchResults: v.optional(v.number()),
  },
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Must be authenticated");
    
    const existing = await ctx.db
      .query("userPreferences")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .first();
    
    if (existing) {
      await ctx.db.patch(existing._id, {
        ...(args.theme && { theme: args.theme }),
        ...(args.searchEnabled !== undefined && { searchEnabled: args.searchEnabled }),
        ...(args.maxSearchResults && { maxSearchResults: args.maxSearchResults }),
      });
    } else {
      await ctx.db.insert("userPreferences", {
        userId,
        theme: args.theme || "system",
        searchEnabled: args.searchEnabled !== undefined ? args.searchEnabled : true,
        maxSearchResults: args.maxSearchResults || 5,
      });
    }
  },
});
