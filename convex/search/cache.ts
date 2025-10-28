/**
 * Cache management for search and planner results
 * - Ephemeral in-process caching
 * - Rate limiting
 * - TTL management
 */

// Types
export type PlanResult = {
  shouldSearch: boolean;
  contextSummary: string;
  queries: string[];
  suggestNewChat: boolean;
  decisionConfidence: number;
  reasons: string;
};

// Cache configurations
export const PLAN_RATE_LIMIT = 6;
export const PLAN_RATE_WINDOW_MS = 60_000; // 60s
export const PLAN_CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const SEARCH_CACHE_TTL_MS = 15 * 60 * 1000; // 15 minutes

// Ephemeral in-process cache for planner decisions (best-effort only)
export const planCache: Map<string, { expires: number; result: PlanResult }> =
  new Map();

// Search result cache for avoiding duplicate searches
export const searchResultCache: Map<string, { expires: number; results: any }> =
  new Map();

// Simple per-chat leaky bucket limiter
export const planRate: Map<string, number[]> = new Map();

/**
 * Clean up expired cache entries
 */
export function cleanupExpiredCache<T>(
  cache: Map<string, { expires: number; result?: T; results?: T }>,
  now: number = Date.now(),
): void {
  for (const [k, v] of cache) {
    if (v.expires <= now) cache.delete(k);
  }
}

/**
 * Check rate limit for a given chat
 * Returns true if rate limited, false otherwise
 */
export function checkRateLimit(
  chatId: string,
  now: number = Date.now(),
): { isLimited: boolean; pruned: number[] } {
  const bucket = planRate.get(String(chatId)) || [];
  const windowStart = now - PLAN_RATE_WINDOW_MS;
  const pruned = bucket.filter((t) => t >= windowStart);

  return {
    isLimited: pruned.length >= PLAN_RATE_LIMIT,
    pruned,
  };
}

/**
 * Record a rate limit attempt
 */
export function recordRateLimitAttempt(
  chatId: string,
  timestamp: number = Date.now(),
): void {
  const { pruned } = checkRateLimit(chatId, timestamp);
  pruned.push(timestamp);
  planRate.set(String(chatId), pruned);
}

/**
 * Get cached plan result
 */
export function getCachedPlan(
  cacheKey: string,
  now: number = Date.now(),
): PlanResult | null {
  const hit = planCache.get(cacheKey);
  if (hit && hit.expires >= now) {
    return hit.result;
  }
  return null;
}

/**
 * Set cached plan result
 */
export function setCachedPlan(
  cacheKey: string,
  result: PlanResult,
  ttlMs: number = PLAN_CACHE_TTL_MS,
  now: number = Date.now(),
): void {
  planCache.set(cacheKey, {
    expires: now + ttlMs,
    result,
  });
}

/**
 * Get cached search results
 */
export function getCachedSearchResults(
  cacheKey: string,
  now: number = Date.now(),
): any | null {
  const cached = searchResultCache.get(cacheKey);
  if (cached && cached.expires > now) {
    console.info("🎯 Using cached search results for cache key:", cacheKey);
    return cached.results;
  }
  return null;
}

/**
 * Set cached search results
 */
export function setCachedSearchResults(
  cacheKey: string,
  results: any,
  ttlMs: number = SEARCH_CACHE_TTL_MS,
  now: number = Date.now(),
): void {
  searchResultCache.set(cacheKey, {
    results,
    expires: now + ttlMs,
  });
}

/**
 * Invalidate planner cache for a specific chat
 */
export function invalidatePlanCacheForChat(chatId: string): void {
  const prefix = `${chatId}|`;
  for (const key of Array.from(planCache.keys())) {
    if (key.startsWith(prefix)) planCache.delete(key);
  }
}

/**
 * Invalidate search result cache for a specific chat
 */
export function invalidateSearchCacheForChat(chatId: string): void {
  const prefix = `${chatId}|`;
  for (const key of Array.from(searchResultCache.keys())) {
    if (key.startsWith(prefix)) searchResultCache.delete(key);
  }
}

// Legacy compatibility exports
export const getCachedResults = getCachedSearchResults;
export const setCachedResults = setCachedSearchResults;
// FIXED: invalidateCache now matches the pattern of other search-related aliases
export const invalidateCache = invalidateSearchCacheForChat;
