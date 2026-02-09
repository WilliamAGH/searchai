import { v } from "convex/values";
import { query } from "../_generated/server";

const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 1000;

function normalizeBatchSize(limit?: number): number {
  const safeLimit =
    limit !== undefined && Number.isFinite(limit)
      ? Math.floor(limit)
      : DEFAULT_BATCH_SIZE;
  return Math.min(Math.max(safeLimit, 1), MAX_BATCH_SIZE);
}

export const listPublicChatSitemapEntries = query({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
  },
  returns: v.object({
    entries: v.array(
      v.object({
        publicId: v.string(),
        updatedAt: v.number(),
      }),
    ),
    nextCursor: v.optional(v.string()),
    isDone: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const page = await ctx.db
      .query("chats")
      .withIndex("by_privacy", (q) => q.eq("privacy", "public"))
      .order("desc")
      .paginate({
        numItems: normalizeBatchSize(args.limit),
        cursor: args.cursor ?? null,
      });

    const entries: Array<{ publicId: string; updatedAt: number }> = [];
    for (const chat of page.page) {
      if (typeof chat.publicId !== "string" || chat.publicId.length === 0) {
        continue;
      }
      entries.push({
        publicId: chat.publicId,
        updatedAt: chat.updatedAt,
      });
    }

    return {
      entries,
      nextCursor: page.isDone ? undefined : page.continueCursor,
      isDone: page.isDone,
    };
  },
});
