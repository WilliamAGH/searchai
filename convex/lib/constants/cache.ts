/**
 * Centralized cache TTL constants (milliseconds).
 * Single source of truth for all cache lifetimes across the app.
 */
export const CACHE_TTL = {
  WORKFLOW_TOKEN_MS: 5 * 60 * 1000, // 5 minutes
  PLAN_MS: 10 * 60 * 1000, // 10 minutes
  SEARCH_MS: 15 * 60 * 1000, // 15 minutes
  SCRAPE_MS: 5 * 60 * 1000, // 5 minutes
} as const;

/**
 * Agent research limits.
 * Controls how many searches and scrapes agents perform.
 */
export const AGENT_LIMITS = {
  MIN_SEARCH_QUERIES: 1,
  MAX_SEARCH_QUERIES: 3,
  MIN_SCRAPE_URLS: 2,
  MAX_SCRAPE_URLS: 4,
  /** Maximum agent turns (API round-trips) before forcing completion */
  MAX_AGENT_TURNS: 6,
  /** Maximum consecutive tool errors before aborting workflow */
  MAX_TOOL_ERRORS: 3,
} as const;

/**
 * Relevance scoring thresholds for source quality classification.
 * Used to categorize search results and scraped pages.
 */
export const RELEVANCE_SCORES = {
  /** Scraped pages are direct sources, high confidence */
  SCRAPED_PAGE: 0.9,
  /** Search result snippets have moderate confidence until verified */
  SEARCH_RESULT: 0.5,
  /** Threshold for "high" relevance classification */
  HIGH_THRESHOLD: 0.8,
  /** Threshold for "medium" relevance classification */
  MEDIUM_THRESHOLD: 0.5,
  /** Score for "high" relevance label in structured output */
  HIGH_LABEL: 0.9,
  /** Score for "medium" relevance label in structured output */
  MEDIUM_LABEL: 0.7,
  /** Score for "low" relevance label in structured output */
  LOW_LABEL: 0.5,
} as const;

/**
 * Planning confidence thresholds for workflow routing decisions.
 */
export const CONFIDENCE_THRESHOLDS = {
  /** Minimum confidence to skip research stage (fast path) */
  SKIP_RESEARCH: 0.9,
} as const;

/**
 * Agent execution timeouts.
 * These prevent indefinite hangs when agents fail to respond.
 *
 * Why these specific values:
 * - AGENT_STAGE_MS (60s): Planning/synthesis stages are single LLM calls
 * - TOOL_EXECUTION_MS (120s): Research stage includes multiple tool calls
 *   (search + scrape), each with network latency
 */
export const AGENT_TIMEOUTS = {
  /** Timeout for single-stage agent calls (planning, synthesis) */
  AGENT_STAGE_MS: 60_000,
  /** Timeout for research stage with tool calls (search + scrape) */
  TOOL_EXECUTION_MS: 120_000,
} as const;
