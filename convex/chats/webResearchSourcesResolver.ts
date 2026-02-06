/**
 * Web research source resolver
 *
 * Builds canonical WebResearchSource[] from messages that may contain
 * current (webResearchSources) or legacy (contextReferences, searchResults,
 * sources) fields. Keeps read paths resilient while backfills run.
 */

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { normalizeUrlForKey, safeParseUrl } from "../lib/url";
import { isRecord, type WebResearchSource } from "../lib/validators";

const UNKNOWN_MESSAGE_ID = "unknown" as const;

export interface WebResearchSourceMessageFields {
  _id?: string;
  timestamp?: number;
  webResearchSources?: unknown;
  contextReferences?: unknown;
  searchResults?: unknown;
  sources?: unknown;
}

/** Shared context passed to every parser function. */
interface ParseContext {
  messageId: string;
  fallbackTimestamp: number;
  index: number;
}

type SourceParser = (
  item: unknown,
  ctx: ParseContext,
) => WebResearchSource | null;

function safeUrlFromUnknown(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const direct = safeParseUrl(trimmed);
  if (direct) return direct.toString().slice(0, 2048);

  if (!/^https?:\/\//i.test(trimmed) && trimmed.includes(".")) {
    const prefixed = safeParseUrl(`https://${trimmed}`);
    if (prefixed) return prefixed.toString().slice(0, 2048);
  }
  return undefined;
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

function buildLegacyContextId(
  messageId: string,
  kind: "context_reference" | "search_result" | "source",
  index: number,
): string {
  return `legacy:${messageId}:${kind}:${index}`;
}

function fromStructuredSource(
  input: unknown,
  ctx: ParseContext,
): WebResearchSource | null {
  if (!isRecord(input)) return null;

  const type = sanitizeType(input.type);
  const url = safeUrlFromUnknown(input.url);
  const title = typeof input.title === "string" ? input.title : undefined;
  const timestamp =
    typeof input.timestamp === "number"
      ? input.timestamp
      : ctx.fallbackTimestamp;
  const relevanceScore = sanitizeRelevanceScore(input.relevanceScore);

  if (!url && !title) return null;

  return {
    contextId:
      typeof input.contextId === "string" && input.contextId.length > 0
        ? input.contextId
        : buildLegacyContextId(ctx.messageId, "context_reference", ctx.index),
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
  ctx: ParseContext,
): WebResearchSource | null {
  if (!isRecord(result)) return null;
  const url = safeUrlFromUnknown(result.url);
  if (!url) return null;

  const type = sanitizeType(result.kind);
  const relevanceScore =
    sanitizeRelevanceScore(result.relevanceScore) ??
    (type === "scraped_page"
      ? RELEVANCE_SCORES.SCRAPED_PAGE
      : RELEVANCE_SCORES.SEARCH_RESULT);

  return {
    contextId: buildLegacyContextId(ctx.messageId, "search_result", ctx.index),
    type,
    url,
    title: typeof result.title === "string" ? result.title : undefined,
    timestamp: ctx.fallbackTimestamp,
    relevanceScore,
  };
}

function fromLegacySourceUrl(
  sourceUrl: unknown,
  ctx: ParseContext,
): WebResearchSource | null {
  const url = safeUrlFromUnknown(sourceUrl);
  if (!url) return null;

  return {
    contextId: buildLegacyContextId(ctx.messageId, "source", ctx.index),
    type: "search_result",
    url,
    title: safeParseUrl(url)?.hostname,
    timestamp: ctx.fallbackTimestamp,
    relevanceScore: RELEVANCE_SCORES.SEARCH_RESULT,
  };
}

/** Parse each item in an optional array and push non-null results. */
function collectParsed(
  items: unknown,
  parser: SourceParser,
  messageId: string,
  fallbackTimestamp: number,
  candidates: WebResearchSource[],
): void {
  if (!Array.isArray(items)) return;
  for (let i = 0; i < items.length; i += 1) {
    const parsed = parser(items[i], { messageId, fallbackTimestamp, index: i });
    if (parsed) candidates.push(parsed);
  }
}

/** Stable deduplication key: URL-based when available, otherwise type+title. */
function deduplicationKey(source: WebResearchSource): string {
  if (source.url) return normalizeUrlForKey(source.url);
  return `${source.type}:${source.title ?? source.contextId}`;
}

function deduplicateSources(
  candidates: WebResearchSource[],
): WebResearchSource[] {
  const seen = new Map<string, WebResearchSource>();
  for (const candidate of candidates) {
    const key = deduplicationKey(candidate);
    if (!seen.has(key)) {
      seen.set(key, candidate);
    }
  }
  return Array.from(seen.values());
}

export function hasLegacyWebResearchSourceFields(
  message: WebResearchSourceMessageFields,
): boolean {
  return (
    message.contextReferences !== undefined ||
    message.searchResults !== undefined ||
    message.sources !== undefined
  );
}

/**
 * Builds canonical web research sources from canonical + legacy message fields.
 * This keeps read paths resilient while backfills run.
 */
export function resolveWebResearchSourcesFromMessage(
  message: WebResearchSourceMessageFields,
): WebResearchSource[] {
  const messageId = String(message._id ?? UNKNOWN_MESSAGE_ID);
  const fallbackTimestamp =
    typeof message.timestamp === "number" ? message.timestamp : Date.now();
  const candidates: WebResearchSource[] = [];

  collectParsed(
    message.webResearchSources,
    fromStructuredSource,
    messageId,
    fallbackTimestamp,
    candidates,
  );
  collectParsed(
    message.contextReferences,
    fromStructuredSource,
    messageId,
    fallbackTimestamp,
    candidates,
  );
  collectParsed(
    message.searchResults,
    fromLegacySearchResult,
    messageId,
    fallbackTimestamp,
    candidates,
  );
  collectParsed(
    message.sources,
    fromLegacySourceUrl,
    messageId,
    fallbackTimestamp,
    candidates,
  );

  return deduplicateSources(candidates);
}
