/**
 * IP-based rate limiting for HTTP endpoints
 *
 * Protects against:
 * - Direct API abuse via curl/scripts
 * - Automated bot attacks
 * - Credit/quota exhaustion
 *
 * Uses in-memory tracking (resets on deployment)
 */

/**
 * Rate limit configuration per endpoint
 */
const RATE_LIMITS: Record<string, { requests: number; windowMs: number }> = {
  "/api/ai/agent": { requests: 10, windowMs: 60_000 }, // 10 req/min for AI generation
  "/api/ai/agent/stream": { requests: 10, windowMs: 60_000 }, // 10 req/min for streaming
  "/api/search": { requests: 30, windowMs: 60_000 }, // 30 req/min for search
  "/api/scrape": { requests: 20, windowMs: 60_000 }, // 20 req/min for scraping
};

/**
 * In-memory storage for request timestamps per IP+endpoint
 * Map key: "endpoint:ip" -> array of timestamps
 */
const ipBuckets = new Map<string, number[]>();

/**
 * Extract client IP address from request headers
 * Tries multiple headers in order of reliability:
 * 1. X-Forwarded-For (most common proxy header)
 * 2. X-Real-IP (nginx/cloudflare)
 * 3. CF-Connecting-IP (cloudflare specific)
 *
 * @param request - HTTP request object
 * @returns IP address string or "unknown"
 */
export function extractClientIp(request: Request): string {
  // Try X-Forwarded-For first (comma-separated list, leftmost is client)
  const forwardedFor = request.headers.get("x-forwarded-for");
  if (forwardedFor) {
    const firstIp = forwardedFor.split(",")[0].trim();
    if (firstIp) return firstIp;
  }

  // Try X-Real-IP (single IP)
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp;

  // Try CF-Connecting-IP (Cloudflare)
  const cfIp = request.headers.get("cf-connecting-ip");
  if (cfIp) return cfIp;

  // Fallback: use a fingerprint based on User-Agent
  // This is weaker but prevents complete bypass when no IP headers exist
  const userAgent = request.headers.get("user-agent") || "unknown";
  return `fingerprint:${userAgent.slice(0, 50)}`;
}

/**
 * Check if request should be rate limited
 *
 * @param request - HTTP request object
 * @param endpoint - API endpoint path (e.g., "/api/ai/agent")
 * @param customLimit - Optional override for request limit
 * @param customWindowMs - Optional override for time window
 * @returns Object with allowed status and remaining requests
 */
export function checkIpRateLimit(
  request: Request,
  endpoint: string,
  customLimit?: number,
  customWindowMs?: number,
): { allowed: boolean; remaining: number; resetAt: number } {
  const ip = extractClientIp(request);
  const key = `${endpoint}:${ip}`;
  const now = Date.now();

  // Get configuration (use custom or default)
  const config = RATE_LIMITS[endpoint];
  const limit = customLimit ?? config?.requests ?? 10;
  const windowMs = customWindowMs ?? config?.windowMs ?? 60_000;

  // Get existing bucket or create new one
  const bucket = ipBuckets.get(key) || [];

  // Remove expired timestamps (outside the time window)
  const windowStart = now - windowMs;
  const validTimestamps = bucket.filter((timestamp) => timestamp > windowStart);

  // Check if limit exceeded
  if (validTimestamps.length >= limit) {
    const oldestTimestamp = Math.min(...validTimestamps);
    const resetAt = oldestTimestamp + windowMs;

    console.warn(
      `🚫 Rate limit exceeded for ${endpoint} by ${ip}: ${validTimestamps.length}/${limit} requests in ${windowMs}ms window`,
    );

    return {
      allowed: false,
      remaining: 0,
      resetAt,
    };
  }

  // Add current request timestamp
  validTimestamps.push(now);
  ipBuckets.set(key, validTimestamps);

  return {
    allowed: true,
    remaining: limit - validTimestamps.length,
    resetAt: now + windowMs,
  };
}

/**
 * Clear rate limit data for a specific IP and endpoint
 * Useful for testing or manual intervention
 *
 * @param ip - Client IP address
 * @param endpoint - API endpoint path
 */
export function clearRateLimit(ip: string, endpoint: string): void {
  const key = `${endpoint}:${ip}`;
  ipBuckets.delete(key);
  console.info(`✅ Cleared rate limit for ${endpoint} by ${ip}`);
}

/**
 * Clear all rate limit data
 * Use with caution - only for testing or emergency reset
 */
export function clearAllRateLimits(): void {
  const count = ipBuckets.size;
  ipBuckets.clear();
  console.info(`✅ Cleared all rate limits (${count} entries)`);
}

/**
 * Get current rate limit stats for monitoring
 * @returns Array of rate limit entries with stats
 */
export function getRateLimitStats(): Array<{
  key: string;
  requestCount: number;
  oldestRequest: number;
}> {
  const now = Date.now();
  const stats: Array<{
    key: string;
    requestCount: number;
    oldestRequest: number;
  }> = [];

  for (const [key, timestamps] of ipBuckets.entries()) {
    if (timestamps.length > 0) {
      stats.push({
        key,
        requestCount: timestamps.length,
        oldestRequest: now - Math.min(...timestamps),
      });
    }
  }

  return stats.sort((a, b) => b.requestCount - a.requestCount);
}
