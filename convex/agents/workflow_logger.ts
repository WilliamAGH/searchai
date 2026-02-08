"use node";
/**
 * Workflow Logging Utilities
 *
 * Extracted from orchestration.ts per [CC1b] DRY principle.
 * Centralizes logging with consistent text prefixes and structured data.
 *
 * Per [RC1d]: Dev logging is allowed for learning/debugging.
 * These logs help trace workflow execution without affecting behavior.
 *
 * @see {@link ./orchestration.ts} - consumer of this module
 */
import { CONTENT_LIMITS } from "../lib/constants/cache";

// ============================================
// Log Event Types
// ============================================
/**
 * Workflow log event types with their text prefixes.
 */
export type WorkflowLogEvent =
  | "WORKFLOW_START"
  | "WORKFLOW_COMPLETE"
  | "WORKFLOW_ERROR"
  | "INSTANT_RESPONSE"
  | "FAST_PATH"
  | "PLANNING_COMPLETE"
  | "PLANNING_ERROR"
  | "PARALLEL_SEARCH"
  | "PARALLEL_SEARCH_COMPLETE"
  | "PARALLEL_SCRAPE"
  | "PARALLEL_SCRAPE_SKIP"
  | "PARALLEL_SCRAPE_COMPLETE"
  | "PARALLEL_EXECUTION_COMPLETE"
  | "TOOL_CALL"
  | "TOOL_OUTPUT_SKIP"
  | "HARVEST_SEARCH"
  | "HARVEST_SCRAPE"
  | "HARVEST_SCRAPE_SKIP"
  | "CONTEXT_PIPELINE"
  | "SOURCES_SUMMARY"
  | "SYNTHESIS_STREAMING"
  | "SYNTHESIS_COMPLETE"
  | "SCRAPED_CONTENT_SUMMARY"
  | "SEARCH_FAILED"
  | "SCRAPE_FAILED"
  | "MAX_TURNS_EXCEEDED"
  | "MAX_TURNS_RECOVERED"
  | "MAX_TURNS_PARTIAL"
  | "MAX_TURNS_UNRECOVERABLE";

/**
 * Log prefixes for each event type.
 * Plain text markers for structured logging (no emojis per project standards).
 */
const LOG_PREFIXES: Record<WorkflowLogEvent, string> = {
  WORKFLOW_START: "[START]",
  WORKFLOW_COMPLETE: "[DONE]",
  WORKFLOW_ERROR: "[ERR]",
  INSTANT_RESPONSE: "[INSTANT]",
  FAST_PATH: "[FAST]",
  PLANNING_COMPLETE: "[PLAN]",
  PLANNING_ERROR: "[ERR-PLAN]",
  PARALLEL_SEARCH: "[SEARCH]",
  PARALLEL_SEARCH_COMPLETE: "[SEARCH-DONE]",
  PARALLEL_SCRAPE: "[SCRAPE]",
  PARALLEL_SCRAPE_SKIP: "[SCRAPE-SKIP]",
  PARALLEL_SCRAPE_COMPLETE: "[SCRAPE-DONE]",
  PARALLEL_EXECUTION_COMPLETE: "[EXEC-DONE]",
  TOOL_CALL: "[TOOL]",
  TOOL_OUTPUT_SKIP: "[TOOL-SKIP]",
  HARVEST_SEARCH: "[HARVEST]",
  HARVEST_SCRAPE: "[HARVEST]",
  HARVEST_SCRAPE_SKIP: "[HARVEST-SKIP]",
  CONTEXT_PIPELINE: "[CTX]",
  SOURCES_SUMMARY: "[SOURCES]",
  SYNTHESIS_STREAMING: "[SYNTH]",
  SYNTHESIS_COMPLETE: "[SYNTH-DONE]",
  SCRAPED_CONTENT_SUMMARY: "[CONTENT]",
  SEARCH_FAILED: "[ERR-SEARCH]",
  SCRAPE_FAILED: "[ERR-SCRAPE]",
  MAX_TURNS_EXCEEDED: "[MAX-TURNS]",
  MAX_TURNS_RECOVERED: "[RECOVERED]",
  MAX_TURNS_PARTIAL: "[PARTIAL]",
  MAX_TURNS_UNRECOVERABLE: "[ERR-MAX-TURNS]",
};
// ============================================
// Core Logging Function
// ============================================
/**
 * Log a workflow event with consistent formatting.
 *
 * @param event - The type of workflow event
 * @param message - Human-readable message
 * @param data - Optional structured data to include
 */
export function logWorkflow(
  event: WorkflowLogEvent,
  message: string,
  data?: Record<string, unknown>,
): void {
  const prefix = LOG_PREFIXES[event];
  if (data) {
    console.log(`${prefix} ${event}: ${message}`, data);
  } else {
    console.log(`${prefix} ${event}: ${message}`);
  }
}

/**
 * Log a workflow error.
 *
 * @param event - The type of workflow event
 * @param message - Error message
 * @param error - The error object or details
 */
export function logWorkflowError(
  event: WorkflowLogEvent,
  message: string,
  error?: unknown,
): void {
  const prefix = LOG_PREFIXES[event];
  if (error) {
    console.error(`${prefix} ${event}: ${message}`, error);
  } else {
    console.error(`${prefix} ${event}: ${message}`);
  }
}

// ============================================
// Convenience Wrappers
// ============================================
/**
 * Log workflow start.
 */
export function logWorkflowStart(
  workflowType: "conversational" | "research",
  query: string,
): void {
  const truncatedQuery =
    query.length > CONTENT_LIMITS.QUERY_DISPLAY_LENGTH
      ? `${query.substring(0, CONTENT_LIMITS.QUERY_DISPLAY_LENGTH)}...`
      : query;
  logWorkflow(
    "WORKFLOW_START",
    `${workflowType.toUpperCase()} WORKFLOW START: "${truncatedQuery}"`,
  );
}

/**
 * Log workflow completion with statistics.
 */
export function logWorkflowComplete(stats: {
  totalDurationMs: number;
  searchResultCount?: number;
  scrapedPageCount?: number;
  answerLength: number;
}): void {
  const parts = [`${stats.totalDurationMs}ms total`];
  if (stats.searchResultCount !== undefined) {
    parts.push(`${stats.searchResultCount} results`);
  }
  if (stats.scrapedPageCount !== undefined) {
    parts.push(`${stats.scrapedPageCount} pages`);
  }
  parts.push(`${stats.answerLength} chars`);

  logWorkflow("WORKFLOW_COMPLETE", parts.join(" | "));
}

/**
 * Log a tool call detection.
 */
export function logToolCall(
  toolName: string,
  details: {
    eventName?: string;
    itemType?: string;
    rawItemType?: string;
    query?: string;
    url?: string;
    reasoning?: string;
  },
): void {
  logWorkflow("TOOL_CALL", `TOOL CALL DETECTED: ${toolName}`, details);
}

/**
 * Log planning completion.
 */
export function logPlanningComplete(
  durationMs: number,
  queryCount: number,
): void {
  logWorkflow(
    "PLANNING_COMPLETE",
    `PLANNING COMPLETE: ${durationMs}ms | queries: ${queryCount}`,
  );
}

/**
 * Log parallel search progress.
 */
export function logParallelSearch(queryCount: number): void {
  logWorkflow(
    "PARALLEL_SEARCH",
    `PARALLEL SEARCH: Executing ${queryCount} searches simultaneously...`,
  );
}

/**
 * Log individual search result.
 */
export function logSearchResult(
  durationMs: number,
  query: string,
  resultCount: number,
): void {
  logWorkflow(
    "PARALLEL_SEARCH",
    `PARALLEL SEARCH [${durationMs}ms]: "${query}" → ${resultCount} results`,
  );
}

/**
 * Log parallel search completion.
 */
export function logParallelSearchComplete(
  durationMs: number,
  totalResults: number,
): void {
  logWorkflow(
    "PARALLEL_SEARCH_COMPLETE",
    `PARALLEL SEARCH COMPLETE [${durationMs}ms]: ${totalResults} total results`,
  );
}

/**
 * Log parallel scrape progress.
 */
export function logParallelScrape(urlCount: number): void {
  logWorkflow(
    "PARALLEL_SCRAPE",
    `PARALLEL SCRAPE: Fetching ${urlCount} URLs simultaneously...`,
  );
}

/**
 * Log individual scrape result.
 */
export function logScrapeResult(
  durationMs: number,
  url: string,
  charCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE",
    `PARALLEL SCRAPE [${durationMs}ms]: ${url} → ${charCount} chars`,
  );
}

/**
 * Log scrape skip due to minimal content.
 */
export function logScrapeSkip(
  durationMs: number,
  url: string,
  charCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE_SKIP",
    `PARALLEL SCRAPE SKIP [${durationMs}ms]: ${url} (too short: ${charCount} chars)`,
  );
}

/**
 * Log parallel scrape completion.
 */
export function logParallelScrapeComplete(
  durationMs: number,
  successCount: number,
  totalCount: number,
): void {
  logWorkflow(
    "PARALLEL_SCRAPE_COMPLETE",
    `PARALLEL SCRAPE COMPLETE [${durationMs}ms]: ${successCount}/${totalCount} pages`,
  );
}

/**
 * Log context pipeline status for debugging.
 */
export function logContextPipeline(status: {
  agentScrapedCount: number;
  harvestedScrapedCount: number;
  mergedScrapedCount: number;
  agentEnrichmentKeys: string[];
  harvestedEnrichmentKeys: string[];
  usingHarvestedScraped: boolean;
  usingHarvestedEnrichment: boolean;
  hasKnowledgeGraph: boolean;
  hasAnswerBox: boolean;
}): void {
  logWorkflow("CONTEXT_PIPELINE", "CONTEXT PIPELINE STATUS:", status);
}

/**
 * Log sources summary for conversational workflow.
 */
export function logSourcesSummary(sourceCount: number, urlCount: number): void {
  logWorkflow(
    "SOURCES_SUMMARY",
    `WEB RESEARCH SOURCES: ${sourceCount} sources, ${urlCount} URLs`,
  );
}

/**
 * Log synthesis streaming metrics.
 */
export function logSynthesisStreaming(durationMs: number): void {
  logWorkflow("SYNTHESIS_STREAMING", `SYNTHESIS STREAMING: ${durationMs}ms`);
}

/**
 * Log synthesis completion.
 */
export function logSynthesisComplete(durationMs: number): void {
  logWorkflow("SYNTHESIS_COMPLETE", `SYNTHESIS COMPLETE: ${durationMs}ms`);
}

/**
 * Log scraped content summary for synthesis.
 */
export function logScrapedContentSummary(
  pages: Array<{
    url: string;
    contentPreview: string;
  }>,
): void {
  const totalChars = pages.reduce((sum, p) => sum + p.contentPreview.length, 0);
  logWorkflow("SCRAPED_CONTENT_SUMMARY", "SCRAPED CONTENT FOR SYNTHESIS:", {
    pageCount: pages.length,
    totalChars,
    pages,
  });
}
