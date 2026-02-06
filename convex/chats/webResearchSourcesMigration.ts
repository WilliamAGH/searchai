import { v } from "convex/values";
import type { Doc } from "../_generated/dataModel";
import { internalMutation } from "../_generated/server";
import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { generateMessageId } from "../lib/id_generator";
import { normalizeUrlForKey, safeParseUrl } from "../lib/url";
import { isRecord, type WebResearchSource } from "../lib/validators";

const DEFAULT_BATCH_SIZE = 200;
const MAX_BATCH_SIZE = 500;

function sanitizeUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = safeParseUrl(value);
  return parsed ? parsed.toString().slice(0, 2048) : undefined;
}

function sanitizeType(value: unknown): WebResearchSource["type"] {
  return value === "scraped_page" || value === "research_summary"
    ? value
    : "search_result";
}

function sanitizeRelevanceScore(value: unknown): number | undefined {
  if (typeof value !== "number" || Number.isNaN(value)) return undefined;
  return Math.max(0, Math.min(1, value));
}

function toWebResearchSource(
  input: unknown,
  fallbackTimestamp: number,
): WebResearchSource | null {
  if (!isRecord(input)) return null;

  const type = sanitizeType(input.type);
  const url = sanitizeUrl(input.url);
  const title = typeof input.title === "string" ? input.title : undefined;
  const timestamp =
    typeof input.timestamp === "number" ? input.timestamp : fallbackTimestamp;
  const relevanceScore = sanitizeRelevanceScore(input.relevanceScore);

  if (!url && !title) return null;

  return {
    contextId:
      typeof input.contextId === "string" && input.contextId.length > 0
        ? input.contextId
        : generateMessageId(),
    type,
    url,
    title,
    timestamp,
    relevanceScore,
    metadata: isRecord(input.metadata) ? input.metadata : undefined,
  };
}

function fromLegacySearchResult(
  result: unknown,
  fallbackTimestamp: number,
): WebResearchSource | null {
  if (!isRecord(result)) return null;
  const url = sanitizeUrl(result.url);
  if (!url) return null;

  const type = sanitizeType(result.kind);
  const relevanceScore =
    sanitizeRelevanceScore(result.relevanceScore) ??
    (type === "scraped_page"
      ? RELEVANCE_SCORES.SCRAPED_PAGE
      : RELEVANCE_SCORES.SEARCH_RESULT);

  return {
    contextId: generateMessageId(),
    type,
    url,
    title: typeof result.title === "string" ? result.title : undefined,
    timestamp: fallbackTimestamp,
    relevanceScore,
  };
}

function fromLegacySourceUrl(
  sourceUrl: unknown,
  fallbackTimestamp: number,
): WebResearchSource | null {
  const url = sanitizeUrl(sourceUrl);
  if (!url) return null;

  return {
    contextId: generateMessageId(),
    type: "search_result",
    url,
    title: safeParseUrl(url)?.hostname,
    timestamp: fallbackTimestamp,
    relevanceScore: RELEVANCE_SCORES.SEARCH_RESULT,
  };
}

function mergeWebResearchSources(
  message: Doc<"messages">,
): WebResearchSource[] {
  const fallbackTimestamp =
    typeof message.timestamp === "number" ? message.timestamp : Date.now();

  const candidates: WebResearchSource[] = [];

  if (Array.isArray(message.webResearchSources)) {
    for (const src of message.webResearchSources) {
      const parsed = toWebResearchSource(src, fallbackTimestamp);
      if (parsed) candidates.push(parsed);
    }
  }

  if (Array.isArray(message.contextReferences)) {
    for (const legacy of message.contextReferences) {
      const parsed = toWebResearchSource(legacy, fallbackTimestamp);
      if (parsed) candidates.push(parsed);
    }
  }

  if (Array.isArray(message.searchResults)) {
    for (const result of message.searchResults) {
      const parsed = fromLegacySearchResult(result, fallbackTimestamp);
      if (parsed) candidates.push(parsed);
    }
  }

  if (Array.isArray(message.sources)) {
    for (const sourceUrl of message.sources) {
      const parsed = fromLegacySourceUrl(sourceUrl, fallbackTimestamp);
      if (parsed) candidates.push(parsed);
    }
  }

  const deduped = new Map<string, WebResearchSource>();
  for (const candidate of candidates) {
    const key = candidate.url
      ? normalizeUrlForKey(candidate.url)
      : candidate.contextId;
    if (!deduped.has(key)) {
      deduped.set(key, candidate);
    }
  }

  return Array.from(deduped.values());
}

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
      const canonical = mergeWebResearchSources(message);
      const hadLegacyFields =
        message.contextReferences !== undefined ||
        message.searchResults !== undefined ||
        message.sources !== undefined;
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
