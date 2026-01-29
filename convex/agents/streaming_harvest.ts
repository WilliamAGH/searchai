"use node";

import { generateMessageId } from "../lib/id_generator";
import { RELEVANCE_SCORES } from "../lib/constants/cache";
import { isUuidV7, normalizeUrl } from "./orchestration_helpers";
import {
  safeParseSearchToolOutput,
  safeParseScrapeToolOutput,
  type HarvestedData,
} from "../schemas/agents";

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
