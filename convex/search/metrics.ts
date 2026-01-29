/**
 * Metrics and analytics for search operations
 */

import { v } from "convex/values";
import { internalMutation, action } from "../_generated/server";
import { internal } from "../_generated/api";

/**
 * Record metric for analytics
 * - Daily aggregation by name
 * - Increments counter
 * - Best-effort (fails silently)
 * @param ctx - Context with database
 * @param name - Metric name
 * @param chatId - Optional chat ID
 */
export const recordMetric = internalMutation({
  args: {
    name: v.union(
      v.literal("planner_invoked"),
      v.literal("planner_rate_limited"),
      v.literal("user_overrode_prompt"),
      v.literal("new_chat_confirmed"),
    ),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      const date = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
      const existing = await ctx.db
        .query("metrics")
        .withIndex("by_name_and_date", (q) => q.eq("name", args.name).eq("date", date))
        .first();
      if (existing) {
        await ctx.db.patch(existing._id, { count: (existing.count || 0) + 1 });
      } else {
        await ctx.db.insert("metrics", {
          name: args.name,
          date,
          chatId: args.chatId,
          count: 1,
        });
      }
    } catch (e) {
      console.warn("metrics failed", args.name, e);
    }
    return null;
  },
});

/**
 * Record client-side metric
 * - Supports: user_overrode_prompt, new_chat_confirmed
 * - Optional chatId for attribution
 */
export const recordClientMetric = action({
  args: {
    name: v.union(v.literal("user_overrode_prompt"), v.literal("new_chat_confirmed")),
    chatId: v.optional(v.id("chats")),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    try {
      await ctx.runMutation(internal.search.metrics.recordMetric, {
        name: args.name,
        chatId: args.chatId,
      });
    } catch (e) {
      console.warn("Client metric failed", args.name, e);
    }
    return null;
  },
});
