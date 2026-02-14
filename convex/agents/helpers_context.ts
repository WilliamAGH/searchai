"use node";

/**
 * Context Management Helpers for Agent Workflows
 *
 * Handles source harvesting, normalization, and context/provenance tracking.
 * Used by orchestration.ts to prepare data for LLM context window.
 */

import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { generateMessageId } from "../lib/id_generator";
import { normalizeHttpUrl } from "../lib/urlHttp";
import type { WebResearchSource } from "../lib/validators";
import { isUuidV7, normalizeUrl } from "./helpers_utils";

const MAX_SOURCE_URL_LENGTH = 2048;

function normalizeSourceUrl(url: string | undefined): string | undefined {
  return normalizeHttpUrl(url, MAX_SOURCE_URL_LENGTH);
}

function requireNormalizedUrl(
  url: string,
  contextId: string,
  label: string,
): string | null {
  const normalized = normalizeSourceUrl(url);
  if (!normalized) {
    console.error(`[agents] Excluded ${label} with invalid URL`, {
      contextId,
      originalUrl: url,
    });
    return null;
  }
  return normalized;
}

function toNormalizedUrlSet(urls: string[]): Set<string> {
  return new Set(
    urls
      .map((url) => normalizeUrl(url))
      .filter((url): url is string => url !== null),
  );
}

type ScrapedHarvestedSource = {
  contextId: string;
  url: string;
  title: string;
  content: string;
  summary: string;
  contentLength: number;
  scrapedAt?: number;
  relevanceScore?: number;
};

type SearchHarvestedSource = {
  contextId?: string;
  url: string;
  title: string;
  snippet: string;
  relevanceScore?: number;
};

function formatIsoDate(timestamp: number | undefined): string {
  if (typeof timestamp !== "number") {
    return "unknown";
  }
  return new Date(timestamp).toISOString();
}

/**
 * Build debug/provenance markdown for a scraped page source.
 *
 * This is a developer-inspection payload only. It documents exactly what this
 * Convex run harvested for the source. It does NOT affect model context.
 */
function buildScrapedSourceContextMarkdown(
  scraped: ScrapedHarvestedSource,
): string {
  return [
    "## Convex Server Source Context",
    "- sourceType: scraped_page",
    `- contextId: ${scraped.contextId}`,
    `- url: ${scraped.url}`,
    `- title: ${scraped.title || "Untitled"}`,
    `- scrapedAt: ${formatIsoDate(scraped.scrapedAt)}`,
    `- relevanceScore: ${scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE}`,
    `- contentLength: ${scraped.contentLength}`,
    "",
    "### Summary",
    scraped.summary || "_none_",
    "",
    "### Content",
    "```text",
    scraped.content || "",
    "```",
  ].join("\n");
}

/**
 * Build debug/provenance markdown for a search-result source.
 *
 * This is a developer-inspection payload only. It documents the harvested
 * search metadata associated with the source. It does NOT affect model context.
 */
function buildSearchSourceContextMarkdown(params: {
  source: SearchHarvestedSource;
  crawlAttempted: boolean;
  crawlSucceeded: boolean;
  crawlErrorMessage?: string;
  markedLowRelevance: boolean;
}): string {
  const { source } = params;

  return [
    "## Convex Server Source Context",
    "- sourceType: search_result",
    `- contextId: ${source.contextId ?? "generated-after-harvest"}`,
    `- url: ${source.url}`,
    `- title: ${source.title || "Untitled"}`,
    `- relevanceScore: ${source.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT}`,
    `- crawlAttempted: ${params.crawlAttempted ? "true" : "false"}`,
    `- crawlSucceeded: ${params.crawlSucceeded ? "true" : "false"}`,
    params.crawlErrorMessage
      ? `- crawlErrorMessage: ${params.crawlErrorMessage}`
      : "- crawlErrorMessage: none",
    `- markedLowRelevance: ${params.markedLowRelevance ? "true" : "false"}`,
    "",
    "### Snippet",
    source.snippet || "_none_",
  ].join("\n");
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

export function buildWebResearchSourcesFromHarvested(
  harvested: {
    scrapedContent: ScrapedHarvestedSource[];
    searchResults: SearchHarvestedSource[];
    failedScrapeUrls?: Set<string>;
    failedScrapeErrors?: Map<string, string>;
  },
  options?: { includeDebugSourceContext?: boolean },
): WebResearchSource[] {
  const includeDebugSourceContext = options?.includeDebugSourceContext === true;
  const webResearchSources: WebResearchSource[] = [];
  const now = Date.now();

  for (const scraped of harvested.scrapedContent) {
    const normalizedUrl = requireNormalizedUrl(
      scraped.url,
      scraped.contextId,
      "scraped source",
    );
    if (!normalizedUrl) continue;

    const metadata: Record<string, string | number | boolean> = {
      crawlAttempted: true,
      crawlSucceeded: true,
      // Persist the cleaned body captured by scrape_webpage for downstream UI/debug copy.
      scrapedBodyContent: scraped.content,
      scrapedBodyContentLength: scraped.contentLength,
    };
    if (includeDebugSourceContext) {
      metadata.serverContextMarkdown =
        buildScrapedSourceContextMarkdown(scraped);
    }

    webResearchSources.push({
      contextId: scraped.contextId,
      type: "scraped_page",
      url: normalizedUrl,
      title: scraped.title,
      timestamp: scraped.scrapedAt ?? now,
      relevanceScore: scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE,
      metadata,
    });
  }

  // Deduplicate and normalize scraped URLs
  const scrapedUrls = harvested.scrapedContent
    .map((s) => normalizeSourceUrl(s.url))
    .filter((url): url is string => typeof url === "string");
  const scrapedNormalizedUrls = toNormalizedUrlSet(scrapedUrls);

  // Deduplicate and normalize failed scrape URLs
  const failedUrls = Array.from(
    harvested.failedScrapeUrls ?? new Set<string>(),
  );
  const failedNormalizedUrls = toNormalizedUrlSet(failedUrls);

  const failedErrorByUrl = new Map<string, string>();
  for (const [url, error] of harvested.failedScrapeErrors ?? new Map()) {
    const normalized = normalizeUrl(url);
    if (normalized && typeof error === "string" && error.trim().length > 0) {
      failedErrorByUrl.set(normalized, error);
    }
  }

  for (const result of harvested.searchResults) {
    const normalizedUrl = requireNormalizedUrl(
      result.url,
      result.contextId ?? "unknown",
      "search result",
    );
    if (!normalizedUrl) continue;

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

      const metadata: Record<string, string | number | boolean> = {};
      if (wasFailedScrape) {
        metadata.crawlAttempted = true;
        metadata.crawlSucceeded = false;
        if (crawlErrorMessage) {
          metadata.crawlErrorMessage = crawlErrorMessage;
        }
      } else if (markedLowRelevance) {
        metadata.crawlAttempted = false;
        metadata.markedLowRelevance = true;
        metadata.relevanceThreshold = RELEVANCE_SCORES.MEDIUM_THRESHOLD;
      }
      if (includeDebugSourceContext) {
        metadata.serverContextMarkdown = buildSearchSourceContextMarkdown({
          source: result,
          crawlAttempted: wasFailedScrape,
          crawlSucceeded: !wasFailedScrape,
          crawlErrorMessage,
          markedLowRelevance,
        });
      }

      webResearchSources.push({
        contextId: result.contextId ?? generateMessageId(),
        type: "search_result",
        url: normalizedUrl,
        title: result.title,
        timestamp: now,
        relevanceScore,
        ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
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
    const normalizedUrl = requireNormalizedUrl(
      source.url,
      source.contextId,
      "source",
    );
    if (!normalizedUrl) continue;

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
