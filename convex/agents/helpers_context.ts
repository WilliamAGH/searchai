"use node";

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { generateMessageId } from "../lib/id_generator";
import type { WebResearchSource } from "../lib/validators";
import { isUuidV7, normalizeUrl } from "./helpers_utils";

export function normalizeSourceContextIds(
  sourcesUsed: Array<{
    url?: string;
    contextId?: string;
    type: "search_result" | "scraped_page";
  }>,
  urlContextMap: Map<string, string>,
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

export function buildWebResearchSourcesFromHarvested(harvested: {
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
}): WebResearchSource[] {
  const webResearchSources: WebResearchSource[] = [];
  const now = Date.now();

  for (const scraped of harvested.scrapedContent) {
    webResearchSources.push({
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
      webResearchSources.push({
        contextId: result.contextId ?? generateMessageId(),
        type: "search_result",
        url: result.url,
        title: result.title,
        timestamp: now,
        relevanceScore: result.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT,
      });
    }
  }

  const uniqueSources = Array.from(
    new Map(
      webResearchSources.map((ref) => {
        const rawUrl = ref.url || "";
        return [normalizeUrl(rawUrl) ?? rawUrl, ref];
      }),
    ).values(),
  );

  return uniqueSources;
}

/**
 * Convert normalized sources to WebResearchSource format.
 * Maps relevance labels to numeric scores for persistence.
 */
export function convertToWebResearchSources(
  sources: Array<{
    url: string;
    title: string;
    contextId: string;
    type: "search_result" | "scraped_page";
    relevance: "high" | "medium" | "low";
  }>,
): WebResearchSource[] {
  const now = Date.now();
  const relevanceToScore: Record<"high" | "medium" | "low", number> = {
    high: RELEVANCE_SCORES.HIGH_LABEL,
    medium: RELEVANCE_SCORES.MEDIUM_LABEL,
    low: RELEVANCE_SCORES.LOW_LABEL,
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
