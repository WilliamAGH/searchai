import { internalMutation, query } from "./_generated/server";
import { v } from "convex/values";

/**
 * Write a workflow event (called from orchestration action)
 */
export const writeEvent = internalMutation({
  args: {
    workflowId: v.string(),
    sequence: v.number(),
    type: v.string(),
    // Justified v.any(): polymorphic event payloads; see schema.ts workflowEvents comment
    data: v.any(),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("workflowEvents", {
      workflowId: args.workflowId,
      sequence: args.sequence,
      type: args.type,
      data: args.data,
      timestamp: Date.now(),
    });
  },
});

/**
 * Get events for a workflow since a given sequence number
 */
export const getEventsSince = query({
  args: {
    workflowId: v.string(),
    sinceSequence: v.number(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("workflowEvents")
      .withIndex("by_workflow_sequence", (q) =>
        q.eq("workflowId", args.workflowId).gt("sequence", args.sinceSequence),
      )
      .collect();

    return events.map((e) => ({
      sequence: e.sequence,
      type: e.type,
      data: e.data,
      timestamp: e.timestamp,
    }));
  },
});

/**
 * Clean up events for a completed workflow
 */
export const cleanupEvents = internalMutation({
  args: {
    workflowId: v.string(),
  },
  handler: async (ctx, args) => {
    const events = await ctx.db
      .query("workflowEvents")
      .withIndex("by_workflow", (q) => q.eq("workflowId", args.workflowId))
      .collect();

    for (const event of events) {
      await ctx.db.delete(event._id);
    }
  },
});
