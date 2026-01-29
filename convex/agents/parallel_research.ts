"use node";
/**
 * Parallel Research Execution
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Executes search queries and webpage scrapes in parallel for faster research.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 */
import { api } from "../_generated/api";
import { generateMessageId } from "../lib/id_generator";
import { AGENT_LIMITS, CONTENT_LIMITS, RELEVANCE_SCORES } from "../lib/constants/cache";
import { createEmptyHarvestedData, type HarvestedData } from "../schemas/agents";
import type { ScrapedContent, SerpEnrichment } from "../schemas/search";
import type { WorkflowActionCtx } from "./orchestration_persistence";
import {
  logParallelSearch,
  logSearchResult,
  logWorkflowError,
  logParallelSearchComplete,
  logParallelScrape,
  logScrapeResult,
  logScrapeSkip,
  logParallelScrapeComplete,
  logWorkflow,
} from "./workflow_logger";

// ============================================
// Types
// ============================================

/**
 * Search query from the planning phase.
 */
export interface PlannedSearchQuery {
  query: string;
  reasoning: string;
  priority: number;
}

/**
 * Parameters for parallel research execution.
 */
export interface ParallelResearchParams {
  ctx: WorkflowActionCtx;
  searchQueries: PlannedSearchQuery[];
  maxScrapeUrls?: number;
}

/**
 * Statistics from parallel research execution.
 */
export interface ParallelResearchStats {
  searchDurationMs: number;
  scrapeDurationMs: number;
  totalDurationMs: number;
  searchResultCount: number;
  scrapeSuccessCount: number;
  scrapeFailCount: number;
  queriesExecuted: number;
}

/**
 * Result of parallel research execution.
 */
export interface ParallelResearchResult {
  harvested: HarvestedData & { serpEnrichment: SerpEnrichment };
  stats: ParallelResearchStats;
}

/**
 * Stream event from parallel research.
 */
export type ParallelResearchEvent =
  | {
      type: "progress";
      stage: "searching" | "scraping";
      message: string;
      queries?: string[];
      urls?: string[];
    }
  | { type: "search_complete"; resultCount: number; durationMs: number }
  | {
      type: "scrape_complete";
      successCount: number;
      failCount: number;
      durationMs: number;
    };

// ============================================
// Parallel Research Executor
// ============================================

/**
 * Execute parallel research (search + scrape).
 *
 * This generator yields progress events while executing searches and scrapes
 * in parallel. It eliminates the 8-13 second LLM "thinking" gaps between
 * sequential tool calls.
 *
 * @param params - Research parameters
 * @yields ParallelResearchEvent for progress updates
 * @returns ParallelResearchResult with harvested data and statistics
 *
 * @example
 * ```ts
 * const research = executeParallelResearch({
 *   ctx,
 *   searchQueries: planningOutput.searchQueries,
 * });
 *
 * for await (const event of research) {
 *   if (event.type === "progress") {
 *     yield writeEvent("progress", event);
 *   }
 * }
 *
 * const result = await research.next();
 * const { harvested, stats } = result.value;
 * ```
 */
export async function* executeParallelResearch(
  params: ParallelResearchParams,
): AsyncGenerator<ParallelResearchEvent, ParallelResearchResult, undefined> {
  const { ctx, searchQueries, maxScrapeUrls = AGENT_LIMITS.MAX_SCRAPE_URLS } = params;

  // Initialize harvested data container
  const serpEnrichment: SerpEnrichment = {};
  const harvested: HarvestedData & { serpEnrichment: SerpEnrichment } = {
    ...createEmptyHarvestedData(),
    serpEnrichment,
  };
  const stats: ParallelResearchStats = {
    searchDurationMs: 0,
    scrapeDurationMs: 0,
    totalDurationMs: 0,
    searchResultCount: 0,
    scrapeSuccessCount: 0,
    scrapeFailCount: 0,
    queriesExecuted: searchQueries.length,
  };

  const parallelStartTime = Date.now();

  // ============================================
  // Phase 1: Parallel Search
  // ============================================

  if (searchQueries.length > 0) {
    yield {
      type: "progress",
      stage: "searching",
      message: `${searchQueries.length} ${searchQueries.length === 1 ? "query" : "queries"} in parallel...`,
      queries: searchQueries.map((q) => q.query),
    };

    logParallelSearch(searchQueries.length);

    const searchStart = Date.now();

    const searchPromises = searchQueries.map(async (sq) => {
      const queryStart = Date.now();
      try {
        // @ts-ignore TS2589 - ActionCtx type inference depth exceeded
        const result = await ctx.runAction(api.search.searchWeb, {
          query: sq.query,
          maxResults: 8,
        });
        logSearchResult(Date.now() - queryStart, sq.query, result.results?.length || 0);
        return { query: sq.query, result, error: null };
      } catch (error) {
        logWorkflowError("SEARCH_FAILED", sq.query, error);
        return { query: sq.query, result: null, error };
      }
    });

    const searchResults = await Promise.all(searchPromises);
    stats.searchDurationMs = Date.now() - searchStart;

    // Harvest all search results
    for (const { result } of searchResults) {
      if (!result?.results) continue;

      for (const r of result.results) {
        harvested.searchResults.push({
          title: r.title,
          url: r.url,
          snippet: r.snippet,
          relevanceScore: r.relevanceScore || 0.5,
        });
        stats.searchResultCount++;
      }

      // Harvest enrichment from first successful search with enrichment
      if (result.enrichment && Object.keys(harvested.serpEnrichment).length === 0) {
        const enrich = result.enrichment;
        if (enrich.knowledgeGraph) {
          harvested.serpEnrichment.knowledgeGraph = enrich.knowledgeGraph;
        }
        if (enrich.answerBox) {
          harvested.serpEnrichment.answerBox = enrich.answerBox;
        }
        if (enrich.peopleAlsoAsk) {
          harvested.serpEnrichment.peopleAlsoAsk = enrich.peopleAlsoAsk;
        }
        if (enrich.relatedSearches) {
          harvested.serpEnrichment.relatedSearches = enrich.relatedSearches;
        }
      }
    }

    logParallelSearchComplete(stats.searchDurationMs, stats.searchResultCount);

    yield {
      type: "search_complete",
      resultCount: stats.searchResultCount,
      durationMs: stats.searchDurationMs,
    };
  }

  // ============================================
  // Phase 2: Parallel Scrape
  // ============================================

  // Deduplicate URLs and select top candidates for scraping
  const uniqueUrls = Array.from(new Map(harvested.searchResults.map((r) => [r.url, r])).values())
    .filter((r) => r.url && r.url.startsWith("http"))
    .sort((a, b) => (b.relevanceScore || 0) - (a.relevanceScore || 0))
    .slice(0, maxScrapeUrls);

  if (uniqueUrls.length > 0) {
    yield {
      type: "progress",
      stage: "scraping",
      message: `${uniqueUrls.length} sources in parallel...`,
      urls: uniqueUrls.map((u) => u.url),
    };

    logParallelScrape(uniqueUrls.length);

    const scrapeStart = Date.now();

    const scrapePromises = uniqueUrls.map(async (urlInfo) => {
      const url = urlInfo.url;
      const contextId = generateMessageId();
      const singleScrapeStart = Date.now();

      try {
        const content = await ctx.runAction(api.search.scraperAction.scrapeUrl, { url });

        // Skip if we got an error response or minimal content
        if (content.content.length < CONTENT_LIMITS.MIN_CONTENT_LENGTH) {
          logScrapeSkip(Date.now() - singleScrapeStart, url, content.content.length);
          return null;
        }

        logScrapeResult(Date.now() - singleScrapeStart, url, content.content.length);

        const scraped: ScrapedContent = {
          url,
          title: content.title,
          content: content.content,
          summary:
            content.summary || content.content.substring(0, CONTENT_LIMITS.SUMMARY_TRUNCATE_LENGTH),
          contentLength: content.content.length,
          scrapedAt: Date.now(),
          contextId,
          relevanceScore: urlInfo.relevanceScore || RELEVANCE_SCORES.SCRAPED_PAGE,
        };
        return scraped;
      } catch (error) {
        logWorkflowError("SCRAPE_FAILED", `${url} [${Date.now() - singleScrapeStart}ms]`, error);
        return null;
      }
    });

    const scrapeResults = await Promise.all(scrapePromises);
    stats.scrapeDurationMs = Date.now() - scrapeStart;

    const successfulScrapes = scrapeResults.filter((r): r is ScrapedContent => r !== null);
    harvested.scrapedContent.push(...successfulScrapes);

    stats.scrapeSuccessCount = successfulScrapes.length;
    stats.scrapeFailCount = uniqueUrls.length - successfulScrapes.length;

    logParallelScrapeComplete(stats.scrapeDurationMs, stats.scrapeSuccessCount, uniqueUrls.length);

    yield {
      type: "scrape_complete",
      successCount: stats.scrapeSuccessCount,
      failCount: stats.scrapeFailCount,
      durationMs: stats.scrapeDurationMs,
    };
  }

  stats.totalDurationMs = Date.now() - parallelStartTime;

  logWorkflow(
    "PARALLEL_EXECUTION_COMPLETE",
    `Total execution: ${stats.totalDurationMs}ms (searches + scrapes)`,
  );

  return { harvested, stats };
}
