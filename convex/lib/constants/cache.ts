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
  /**
   * Maximum agent turns (LLM round-trips) before forcing completion.
   *
   * Turn budget calculation for conversational agent:
   * - 1 turn for plan_research
   * - Up to MAX_SEARCH_QUERIES turns for search_web (if sequential)
   * - Up to MAX_SCRAPE_URLS turns for scrape_webpage (if sequential)
   * - 1 turn for final synthesis
   *
   * Worst case: 1 + 3 + 4 + 1 = 9 turns. Set to 12 for safety margin.
   * Note: If model batches tool calls, actual turns used will be fewer.
   */
  MAX_AGENT_TURNS: 12,
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

/**
 * Content length limits for truncation and previews.
 * Centralizes magic numbers used across agent modules.
 */
export const CONTENT_LIMITS = {
  /** Maximum characters for content preview in logs */
  PREVIEW_MAX_CHARS: 200,
  /** Maximum recent messages to include in context */
  MAX_CONTEXT_MESSAGES: 20,
  /** Maximum characters for full conversation context */
  MAX_CONTEXT_CHARS: 4000,
  /** Maximum characters of image analysis to include in conversation context */
  MAX_IMAGE_ANALYSIS_CONTEXT_CHARS: 2500,
  /** Maximum characters of image analysis persisted to a message */
  MAX_IMAGE_ANALYSIS_PERSIST_CHARS: 12_000,
  /** Maximum characters of image analysis injected into the current agent input */
  MAX_IMAGE_ANALYSIS_INPUT_CHARS: 8_000,
  /** Maximum characters of user query included in vision pre-analysis prompt */
  VISION_USER_QUERY_CONTEXT_CHARS: 500,
  /** Minimum content length to consider valid (filters noise) */
  MIN_CONTENT_LENGTH: 100,
  /** Minimum summary length to consider useful */
  MIN_SUMMARY_LENGTH: 50,
  /** Standard summary truncation length */
  SUMMARY_TRUNCATE_LENGTH: 500,
  /** Log display truncation (297 + "..." = 300) */
  LOG_DISPLAY_LENGTH: 297,
  /** Short field truncation (e.g., userQuestion, researchGoal) */
  SHORT_FIELD_LENGTH: 100,
  /** Query display length in logs */
  QUERY_DISPLAY_LENGTH: 50,
} as const;

/**
 * Token budgets for prompt construction.
 * Controls how much content is included in LLM prompts.
 */
export const TOKEN_BUDGETS = {
  /** Total tokens allocated for scraped content in synthesis prompt */
  TOTAL_CONTENT_TOKENS: 12_000,
  /** Maximum tokens per individual page */
  MAX_TOKENS_PER_PAGE: 3_000,
} as const;
