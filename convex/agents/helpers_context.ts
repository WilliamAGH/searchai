"use node";

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import type { ResearchContextReference } from "../schemas/agents";
import { normalizeUrl } from "./helpers_utils";

export function normalizeSourceContextIds(
  sourcesUsed: Array<{
    url?: string;
    contextId?: string;
    type: "search_result" | "scraped_page";
  }>,
  urlContextMap: Map<string, string>,
  isUuidV7: (value: string | undefined) => boolean,
  normalizeUrl: (url: string | undefined) => string | null,
  generateMessageId: () => string,
): {
  normalized: Array<{
    url?: string;
    contextId: string;
    type: "search_result" | "scraped_page";
  }>;
  invalidCount: number;
} {
  const invalidSources: Array<{ url?: string; type: string }> = [];

  const normalized = (sourcesUsed || []).map((source) => {
    let contextId = source.contextId;
    if (!isUuidV7(contextId) && typeof source.url === "string") {
      const normalizedUrl = normalizeUrl(source.url);
      if (normalizedUrl) {
        const mapped = urlContextMap.get(normalizedUrl);
        if (mapped) {
          contextId = mapped;
        }
      }
    }

    if (!contextId || !isUuidV7(contextId)) {
      contextId = generateMessageId();
      invalidSources.push({ url: source.url, type: source.type });
    }

    return {
      ...source,
      contextId,
    };
  });

  return { normalized, invalidCount: invalidSources.length };
}

export function buildContextReferencesFromHarvested(
  harvested: {
    scrapedContent: Array<{
      contextId: string;
      url: string;
      title: string;
      scrapedAt?: number;
      relevanceScore?: number;
    }>;
    searchResults: Array<{
      contextId?: string;
      url: string;
      title: string;
      relevanceScore?: number;
    }>;
  },
  generateContextId: () => string,
): ResearchContextReference[] {
  const contextReferences: ResearchContextReference[] = [];
  const now = Date.now();

  for (const scraped of harvested.scrapedContent) {
    contextReferences.push({
      contextId: scraped.contextId,
      type: "scraped_page",
      url: scraped.url,
      title: scraped.title,
      timestamp: scraped.scrapedAt ?? now,
      relevanceScore: scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE,
    });
  }

  const scrapedNormalizedUrls = new Set(
    harvested.scrapedContent
      .map((s) => normalizeUrl(s.url))
      .filter((url): url is string => url !== null),
  );

  for (const result of harvested.searchResults) {
    const normalizedResultUrl = normalizeUrl(result.url) ?? result.url;
    if (!scrapedNormalizedUrls.has(normalizedResultUrl)) {
      contextReferences.push({
        contextId: result.contextId ?? generateContextId(),
        type: "search_result",
        url: result.url,
        title: result.title,
        timestamp: now,
        relevanceScore: result.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT,
      });
    }
  }

  const uniqueContextRefs = Array.from(
    new Map(
      contextReferences.map((ref) => {
        const rawUrl = ref.url || "";
        return [normalizeUrl(rawUrl) ?? rawUrl, ref];
      }),
    ).values(),
  );

  return uniqueContextRefs;
}

export function buildSearchResultsFromContextRefs(
  contextReferences: ResearchContextReference[],
): Array<{
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}> {
  return contextReferences
    .filter(
      (ref): ref is ResearchContextReference & { url: string } =>
        typeof ref.url === "string" && ref.url.length > 0,
    )
    .map((ref) => ({
      title: ref.title || ref.url || "",
      url: ref.url,
      snippet: "",
      relevanceScore: ref.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT,
    }));
}

export function extractSourceUrls(
  contextReferences: ResearchContextReference[],
): string[] {
  return contextReferences
    .filter((ref) => ref.url)
    .map((ref) => ref.url as string);
}

/**
 * Convert normalized sources to ResearchContextReference format.
 * Maps relevance labels to numeric scores for persistence.
 */
export function convertToContextReferences(
  sources: Array<{
    url: string;
    title: string;
    contextId: string;
    type: "search_result" | "scraped_page";
    relevance: "high" | "medium" | "low";
  }>,
): ResearchContextReference[] {
  const now = Date.now();
  const relevanceToScore: Record<"high" | "medium" | "low", number> = {
    high: RELEVANCE_SCORES.SCRAPED_PAGE, // 0.9
    medium:
      (RELEVANCE_SCORES.SCRAPED_PAGE + RELEVANCE_SCORES.SEARCH_RESULT) / 2, // 0.7
    low: RELEVANCE_SCORES.SEARCH_RESULT, // 0.5
  };

  return sources.map((source) => ({
    contextId: source.contextId,
    type: source.type,
    url: source.url,
    title: source.title,
    timestamp: now,
    relevanceScore: relevanceToScore[source.relevance],
  }));
}
