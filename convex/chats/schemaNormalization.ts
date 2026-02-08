/**
 * Chat-scoped message schema normalization.
 *
 * Converts legacy message rows to the current canonical shape so pagination and
 * UI projections stay stable across schema updates.
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import {
  internalMutation,
  mutation,
  type MutationCtx,
} from "../_generated/server";
import { hasSessionAccess, hasUserAccess } from "../lib/auth";
import {
  normalizeReasoningValue,
  resolveMessageTimestamp,
} from "./messageNormalization";
import {
  hasLegacyWebResearchSourceFields,
  resolveWebResearchSourcesFromMessage,
} from "./webResearchSourcesResolver";
import { isRecord } from "../lib/validators";

interface NormalizationCounts {
  processed: number;
  normalized: number;
  updatedTimestamp: number;
  updatedReasoning: number;
  updatedSources: number;
}

type MessageNormalizationPatch = {
  timestamp?: number;
  reasoning?: string;
  webResearchSources?: ReturnType<typeof resolveWebResearchSourcesFromMessage>;
  contextReferences?: undefined;
  searchResults?: undefined;
  sources?: undefined;
};

interface MessageNormalizationDelta {
  patch: MessageNormalizationPatch;
  updatedTimestamp: boolean;
  updatedReasoning: boolean;
  updatedSources: boolean;
}

const DEFAULT_BATCH_SIZE = 100;
const MAX_BATCH_SIZE = 500;
const INVALID_NON_ARRAY_SOURCE_SENTINEL = "__INVALID_NON_ARRAY_SOURCE__";

function canonicalizeForComparison(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map((item) => canonicalizeForComparison(item));
  }
  if (isRecord(value)) {
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, item]) => [key, canonicalizeForComparison(item)]),
    );
  }
  return value;
}

function stableStringify(value: unknown): string {
  if (value === undefined) return "[]";
  if (!Array.isArray(value)) return INVALID_NON_ARRAY_SOURCE_SENTINEL;
  return JSON.stringify(canonicalizeForComparison(value)) ?? "[]";
}

function hasCanonicalSourceDiff(
  message: Doc<"messages">,
  canonicalSources: ReturnType<typeof resolveWebResearchSourcesFromMessage>,
): boolean {
  return (
    stableStringify(message.webResearchSources) !==
    stableStringify(canonicalSources)
  );
}

function createEmptyCounts(): NormalizationCounts {
  return {
    processed: 0,
    normalized: 0,
    updatedTimestamp: 0,
    updatedReasoning: 0,
    updatedSources: 0,
  };
}

function accumulateCounts(
  total: NormalizationCounts,
  next: NormalizationCounts,
): void {
  total.processed += next.processed;
  total.normalized += next.normalized;
  total.updatedTimestamp += next.updatedTimestamp;
  total.updatedReasoning += next.updatedReasoning;
  total.updatedSources += next.updatedSources;
}

function buildNormalizationPatch(
  message: Doc<"messages">,
): MessageNormalizationDelta {
  const patch: MessageNormalizationPatch = {};
  let updatedTimestamp = false;
  let updatedReasoning = false;
  let updatedSources = false;

  const timestamp = message.timestamp;
  if (typeof timestamp !== "number" || !Number.isFinite(timestamp)) {
    patch.timestamp = resolveMessageTimestamp(message);
    updatedTimestamp = true;
  }

  if (
    message.reasoning !== undefined &&
    typeof message.reasoning !== "string"
  ) {
    patch.reasoning = normalizeReasoningValue(message.reasoning);
    updatedReasoning = true;
  }

  const canonicalSources = resolveWebResearchSourcesFromMessage(message);
  const hadLegacySourceFields = hasLegacyWebResearchSourceFields(message);
  const sourcesChanged = hasCanonicalSourceDiff(message, canonicalSources);
  if (hadLegacySourceFields || sourcesChanged) {
    patch.webResearchSources = canonicalSources;
    patch.contextReferences = undefined;
    patch.searchResults = undefined;
    patch.sources = undefined;
    updatedSources = true;
  }

  return {
    patch,
    updatedTimestamp,
    updatedReasoning,
    updatedSources,
  };
}

/** Apply normalization to a single message. Returns the delta, or null if no changes needed. */
async function applyMessageNormalization(
  ctx: MutationCtx,
  message: Doc<"messages">,
  dryRun: boolean,
): Promise<MessageNormalizationDelta | null> {
  const delta = buildNormalizationPatch(message);
  if (Object.keys(delta.patch).length === 0) {
    return null;
  }
  if (!dryRun) {
    await ctx.db.patch(message._id, delta.patch);
  }
  return delta;
}

/** Accumulate a single delta's flags into running counts. */
function accumulateDelta(
  counts: NormalizationCounts,
  delta: MessageNormalizationDelta,
): void {
  counts.normalized += 1;
  if (delta.updatedTimestamp) counts.updatedTimestamp += 1;
  if (delta.updatedReasoning) counts.updatedReasoning += 1;
  if (delta.updatedSources) counts.updatedSources += 1;
}

/** Query all messages in a chat and normalize each one. */
async function normalizeMessagesInChat(
  ctx: MutationCtx,
  chatId: Doc<"chats">["_id"],
  dryRun: boolean,
): Promise<NormalizationCounts> {
  const counts = createEmptyCounts();
  const query = ctx.db
    .query("messages")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .order("asc");

  for await (const message of query) {
    counts.processed += 1;
    const delta = await applyMessageNormalization(ctx, message, dryRun);
    if (delta) accumulateDelta(counts, delta);
  }

  return counts;
}

export const normalizeChatMessagesSchema = mutation({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    normalized: v.number(),
    updatedTimestamp: v.number(),
    updatedReasoning: v.number(),
    updatedSources: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) {
      throw new Error("Chat not found");
    }

    const isUserOwner = hasUserAccess(chat, userId);
    const isSessionOwner =
      !chat.userId && hasSessionAccess(chat, args.sessionId);
    if (!isUserOwner && !isSessionOwner) {
      throw new Error("Unauthorized");
    }

    const counts = await normalizeMessagesInChat(
      ctx,
      args.chatId,
      args.dryRun ?? false,
    );

    return {
      ...counts,
      dryRun: args.dryRun ?? false,
    };
  },
});

export const normalizeSessionHistorySchema = mutation({
  args: {
    sessionId: v.optional(v.string()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    chatsProcessed: v.number(),
    processed: v.number(),
    normalized: v.number(),
    updatedTimestamp: v.number(),
    updatedReasoning: v.number(),
    updatedSources: v.number(),
    dryRun: v.boolean(),
  }),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const dryRun = args.dryRun ?? false;

    let chats: Doc<"chats">[] = [];
    if (userId) {
      chats = await ctx.db
        .query("chats")
        .withIndex("by_user", (q) => q.eq("userId", userId))
        .collect();
    } else if (args.sessionId) {
      chats = (
        await ctx.db
          .query("chats")
          .withIndex("by_sessionId", (q) => q.eq("sessionId", args.sessionId))
          .collect()
      ).filter((chat) => !chat.userId);
    } else {
      throw new Error("sessionId is required for anonymous users");
    }

    const totals = createEmptyCounts();
    for (const chat of chats) {
      const chatCounts = await normalizeMessagesInChat(ctx, chat._id, dryRun);
      accumulateCounts(totals, chatCounts);
    }

    return {
      chatsProcessed: chats.length,
      ...totals,
      dryRun,
    };
  },
});

export const normalizeAllChatsSchemaInternal = internalMutation({
  args: {
    cursor: v.optional(v.string()),
    limit: v.optional(v.number()),
    dryRun: v.optional(v.boolean()),
  },
  returns: v.object({
    processed: v.number(),
    normalized: v.number(),
    updatedTimestamp: v.number(),
    updatedReasoning: v.number(),
    updatedSources: v.number(),
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
    const dryRun = args.dryRun ?? false;
    const totals = createEmptyCounts();
    totals.processed = page.page.length;

    for (const message of page.page) {
      const delta = await applyMessageNormalization(ctx, message, dryRun);
      if (delta) accumulateDelta(totals, delta);
    }

    return {
      ...totals,
      nextCursor: page.isDone ? undefined : page.continueCursor,
      isDone: page.isDone,
      dryRun,
    };
  },
});
