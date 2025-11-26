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
