"use node";

import { generateMessageId } from "../lib/id_generator";
import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { isUuidV7, normalizeUrl } from "./orchestration_helpers";
import {
  safeParseSearchToolOutput,
  safeParseScrapeToolOutput,
  type HarvestedData,
  type ResearchContextReference,
} from "./schema";

/**
 * Harvest search results from a tool output.
 * Returns the number of results harvested.
 * Preserves tool contextId for provenance tracking if present.
 */
export function harvestSearchResults(
  output: unknown,
  harvested: HarvestedData,
): number {
  const parsed = safeParseSearchToolOutput(output, "harvestSearchResults");
  if (!parsed) return 0;

  // Capture tool-level contextId for provenance (shared across all results from this call)
  const toolContextId = isUuidV7(parsed.contextId)
    ? parsed.contextId
    : undefined;

  let count = 0;
  for (const r of parsed.results) {
    if (r.url && r.title) {
      harvested.searchResults.push({
        title: r.title,
        url: r.url,
        snippet: r.snippet || "",
        relevanceScore: r.relevanceScore || RELEVANCE_SCORES.SEARCH_RESULT,
        contextId: toolContextId, // Preserve provenance back to tool call
      });
      count++;
    }
  }
  return count;
}

/**
 * Harvest scraped content from a tool output.
 * Returns true if content was harvested, false if skipped (duplicate or invalid).
 */
export function harvestScrapedContent(
  output: unknown,
  harvested: HarvestedData,
): boolean {
  const parsed = safeParseScrapeToolOutput(output, "harvestScrapedContent");
  if (!parsed) return false;
  const { url: rawUrl, content } = parsed;

  if (!rawUrl || !content) return false;

  // Normalize URL for deduplication
  const normalizedUrl = normalizeUrl(rawUrl) ?? rawUrl;
  if (harvested.scrapedUrls.has(normalizedUrl)) {
    return false; // Duplicate
  }

  harvested.scrapedUrls.add(normalizedUrl);

  // Extract or generate context ID
  const contextId = isUuidV7(parsed.contextId)
    ? parsed.contextId
    : generateMessageId();

  harvested.scrapedContent.push({
    url: rawUrl,
    title: parsed.title || "",
    content,
    summary: parsed.summary || "",
    contentLength: content.length || 0,
    scrapedAt: parsed.scrapedAt ?? Date.now(),
    contextId,
    relevanceScore: RELEVANCE_SCORES.SCRAPED_PAGE,
  });

  return true;
}

/**
 * Build context references from harvested data.
 *
 * Creates ResearchContextReference entries from scraped content and search results,
 * deduplicating by normalized URL.
 *
 * @param harvested - The harvested data from tool outputs
 * @param now - Current timestamp (defaults to Date.now())
 * @returns Deduplicated array of context references
 */
export function buildContextReferencesFromHarvested(
  harvested: HarvestedData,
  now: number = Date.now(),
): ResearchContextReference[] {
  const contextReferences: ResearchContextReference[] = [];

  // Add scraped pages as high-relevance sources
  for (const scraped of harvested.scrapedContent) {
    contextReferences.push({
      contextId: scraped.contextId,
      type: "scraped_page",
      url: scraped.url,
      title: scraped.title,
      timestamp: scraped.scrapedAt || now,
      relevanceScore: scraped.relevanceScore ?? RELEVANCE_SCORES.SCRAPED_PAGE,
    });
  }

  // Add search results as medium-relevance sources (if not already scraped)
  // Use normalized URLs for dedup check to avoid duplicates with trailing slashes
  const scrapedNormalizedUrls = new Set(
    harvested.scrapedContent
      .map((s) => normalizeUrl(s.url))
      .filter((url): url is string => url !== null),
  );

  for (const result of harvested.searchResults) {
    const normalizedResultUrl = normalizeUrl(result.url) ?? result.url;
    if (!scrapedNormalizedUrls.has(normalizedResultUrl)) {
      contextReferences.push({
        contextId: result.contextId ?? generateMessageId(),
        type: "search_result",
        url: result.url,
        title: result.title,
        timestamp: now,
        relevanceScore: result.relevanceScore ?? RELEVANCE_SCORES.SEARCH_RESULT,
      });
    }
  }

  // Deduplicate by normalized URL, keeping first occurrence (typically higher relevance)
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

/**
 * Build search results array for message persistence.
 *
 * Converts context references to the format expected by the messages table
 * and frontend MessageSources dropdown.
 *
 * @param contextReferences - The context references to convert
 * @returns Array of search results for message storage
 */
export function buildSearchResultsForMessage(
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

/**
 * Extract source URLs from context references.
 *
 * @param contextReferences - The context references to extract from
 * @returns Array of URL strings
 */
export function extractSourceUrls(
  contextReferences: ResearchContextReference[],
): string[] {
  return contextReferences
    .filter((ref) => ref.url)
    .map((ref) => ref.url as string);
}
