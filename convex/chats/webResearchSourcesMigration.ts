import { v } from "convex/values";
import { internalMutation } from "../_generated/server";
import {
  hasLegacyWebResearchSourceFields,
  resolveWebResearchSourcesFromMessage,
} from "./webResearchSourcesResolver";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

export const migrateMessagesToWebResearchSources = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    migrated: v.number(),
    nextCursor: v.optional(v.string()),
    isDone: v.boolean(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const batchSize = Math.min(
      Math.max(args.limit ?? DEFAULT_BATCH_SIZE, 1),
      MAX_BATCH_SIZE,
    );
    const page = await ctx.db
      .query("messages")
      .order("asc")
      .paginate({
        numItems: batchSize,
        cursor: args.cursor ?? null,
      });

    let migrated = 0;
    const dryRun = args.dryRun ?? false;

    for (const message of page.page) {
      const canonical = resolveWebResearchSourcesFromMessage(message);
      const hadLegacyFields = hasLegacyWebResearchSourceFields(message);
      const hadCanonical =
        Array.isArray(message.webResearchSources) &&
        message.webResearchSources.length > 0;
      const canonicalCount = Array.isArray(message.webResearchSources)
        ? message.webResearchSources.length
        : 0;

      const shouldPatch =
        hadLegacyFields ||
        (!hadCanonical && canonical.length > 0) ||
        (hadCanonical && canonical.length !== canonicalCount);

      if (!shouldPatch) {
        continue;
      }

      migrated += 1;
      if (!dryRun) {
        await ctx.db.patch(message._id, {
          webResearchSources: canonical,
          contextReferences: undefined,
          searchResults: undefined,
          sources: undefined,
        });
      }
    }

    return {
      processed: page.page.length,
      migrated,
      nextCursor: page.isDone ? undefined : page.continueCursor,
      isDone: page.isDone,
      dryRun,
    };
  },
});
