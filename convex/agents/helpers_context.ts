"use node";

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { generateMessageId } from "../lib/id_generator";
import { normalizeHttpUrl } from "../lib/urlHttp";
import type { WebResearchSource } from "../lib/validators";
import { isUuidV7, normalizeUrl } from "./helpers_utils";

const MAX_SOURCE_URL_LENGTH = 2048;

function normalizeSourceUrl(url: string | undefined): string | undefined {
  return normalizeHttpUrl(url, MAX_SOURCE_URL_LENGTH);
}

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
  failedScrapeUrls?: Set<string>;
  failedScrapeErrors?: Map<string, string>;
}): WebResearchSource[] {
  const webResearchSources: WebResearchSource[] = [];
  const now = Date.now();

  for (const scraped of harvested.scrapedContent) {
    const normalizedUrl = normalizeSourceUrl(scraped.url);
    if (!normalizedUrl) {
      console.error("[agents] Excluded scraped source with invalid URL", {
        contextId: scraped.contextId,
        originalUrl: scraped.url,
      });
      continue;
    }
    webResearchSources.push({
      contextId: scraped.contextId,
      type: "scraped_page",
      url: normalizedUrl,
      title: scraped.title,
      timestamp: scraped.scrapedAt ?? now,
      relevanceScore: scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE,
      metadata: {
        crawlAttempted: true,
        crawlSucceeded: true,
      },
    });
  }

  const scrapedNormalizedUrls = new Set(
    harvested.scrapedContent
      .map((s) => normalizeSourceUrl(s.url))
      .filter((url): url is string => typeof url === "string")
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => url !== null),
  );
  const failedNormalizedUrls = new Set(
    Array.from(harvested.failedScrapeUrls ?? new Set<string>())
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => url !== null),
  );
  const failedErrorByUrl = new Map<string, string>();
  for (const [url, error] of harvested.failedScrapeErrors ?? new Map()) {
    const normalized = normalizeUrl(url);
    if (normalized && typeof error === "string" && error.trim().length > 0) {
      failedErrorByUrl.set(normalized, error);
    }
  }

  for (const result of harvested.searchResults) {
    const normalizedUrl = normalizeSourceUrl(result.url);
    if (!normalizedUrl) {
      console.error("[agents] Excluded search result with invalid URL", {
        contextId: result.contextId,
        originalUrl: result.url,
      });
      continue;
    }

    const normalizedResultUrl = normalizeUrl(normalizedUrl) ?? normalizedUrl;
    if (!scrapedNormalizedUrls.has(normalizedResultUrl)) {
      const wasFailedScrape = failedNormalizedUrls.has(normalizedResultUrl);
      const crawlErrorMessage = failedErrorByUrl.get(normalizedResultUrl);
      const relevanceScore =
        result.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT;
      // This flag is source metadata for UI/provenance only.
      // It does NOT remove tool output from the already-executed model run.
      const markedLowRelevance =
        !wasFailedScrape && relevanceScore < RELEVANCE_SCORES.MEDIUM_THRESHOLD;
      webResearchSources.push({
        contextId: result.contextId ?? generateMessageId(),
        type: "search_result",
        url: normalizedUrl,
        title: result.title,
        timestamp: now,
        relevanceScore,
        ...(wasFailedScrape && {
          metadata: {
            crawlAttempted: true,
            crawlSucceeded: false,
            crawlErrorMessage,
          },
        }),
        ...(markedLowRelevance && {
          metadata: {
            crawlAttempted: false,
            markedLowRelevance: true,
            relevanceThreshold: RELEVANCE_SCORES.MEDIUM_THRESHOLD,
          },
        }),
      });
    }
  }

  const uniqueSources = Array.from(
    new Map(
      webResearchSources.map((ref) => {
        const rawUrl = ref.url;
        if (rawUrl) {
          return [normalizeUrl(rawUrl) ?? rawUrl, ref] as const;
        }
        return [`${ref.type}:${ref.contextId}`, ref] as const;
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

  const converted: WebResearchSource[] = [];
  for (const source of sources) {
    const normalizedUrl = normalizeSourceUrl(source.url);
    if (!normalizedUrl) {
      console.error("[agents] Excluded source with invalid URL", {
        contextId: source.contextId,
        originalUrl: source.url,
      });
      continue;
    }
    converted.push({
      contextId: source.contextId,
      type: source.type,
      url: normalizedUrl,
      title: source.title,
      timestamp: now,
      relevanceScore: relevanceToScore[source.relevance],
    });
  }
  return converted;
}
