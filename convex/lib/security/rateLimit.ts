/**
 * Rate limiting module for HTTP endpoints
 * Prevents abuse of unauthenticated API endpoints
 */

import type { Doc } from "../../_generated/dataModel";

/**
 * Rate limit configuration
 */
interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  keyPrefix: string;
}

/**
 * Default rate limit configurations per endpoint
 */
const DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
  search: {
    maxRequests: 10,
    windowMs: 60000, // 1 minute
    keyPrefix: "rate_limit:search",
  },
  ai: {
    maxRequests: 5,
    windowMs: 60000, // 1 minute
    keyPrefix: "rate_limit:ai",
  },
  publish: {
    maxRequests: 3,
    windowMs: 300000, // 5 minutes
    keyPrefix: "rate_limit:publish",
  },
};

/**
 * Check if a request is rate limited
 * @param key - Unique identifier for the rate limit (e.g., IP + endpoint)
 * @param config - Rate limit configuration
 * @returns Object with rate limit status and headers
 */
export async function checkRateLimit(
  ctx: any,
  key: string,
  config: RateLimitConfig = DEFAULT_LIMITS.search,
): Promise<{
  isRateLimited: boolean;
  rateLimitHeaders: Record<string, string>;
}> {
  const fullKey = `${config.keyPrefix}:${key}`;
  
  // Try to get existing rate limit entry
  const existingEntry = await ctx.db
    .query("rateLimits")
    .withIndex("by_key", (q: any) => q.eq("key", fullKey))
    .unique()
    .catch(() => null) as Doc<"rateLimits"> | null;

  const now = Date.now();
  const windowStart = now - config.windowMs;
  
  let currentCount = 0;
  
  // If we have an existing entry and it's within the window, use its count
  if (existingEntry && existingEntry.lastRequest > windowStart) {
    currentCount = existingEntry.count;
  }
  
  // If we're at or over the limit, reject the request
  if (currentCount >= config.maxRequests) {
    const retryAfter = Math.ceil((config.windowMs - (now - existingEntry!.lastRequest)) / 1000);
    return {
      isRateLimited: true,
      rateLimitHeaders: {
        "Retry-After": retryAfter.toString(),
        "X-RateLimit-Limit": config.maxRequests.toString(),
        "X-RateLimit-Remaining": "0",
        "X-RateLimit-Reset": Math.ceil((existingEntry!.lastRequest + config.windowMs) / 1000).toString(),
      },
    };
  }
  
  // Increment the request count
  const newCount = currentCount + 1;
  const newEntry = {
    key: fullKey,
    count: newCount,
    lastRequest: now,
  };
  
  if (existingEntry) {
    await ctx.db.patch(existingEntry._id, newEntry);
  } else {
    await ctx.db.insert("rateLimits", newEntry);
  }
  
  const remaining = config.maxRequests - newCount;
  const resetTime = Math.ceil((now + config.windowMs) / 1000);
  
  return {
    isRateLimited: false,
    rateLimitHeaders: {
      "X-RateLimit-Limit": config.maxRequests.toString(),
      "X-RateLimit-Remaining": remaining.toString(),
      "X-RateLimit-Reset": resetTime.toString(),
    },
  };
}

/**
 * Get client IP address from request
 * @param request - HTTP request
 * @returns IP address as string
 */
export function getClientIP(request: Request): string {
  // Try to get IP from headers (in order of preference)
  const xForwardedFor = request.headers.get('x-forwarded-for');
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return xForwardedFor.split(',')[0].trim();
  }
  
  const xRealIP = request.headers.get('x-real-ip');
  if (xRealIP) {
    return xRealIP;
  }
  
  const forwarded = request.headers.get('forwarded');
  if (forwarded) {
    // forwarded header format: "for=192.0.2.60; proto=http; by=203.0.113.43"
    const match = forwarded.match(/for=(\S+)/);
    if (match) {
      return match[1];
    }
  }
  
  // If no headers provide the IP, return a default identifier
  return "unknown";
}

/**
 * Create a rate limited response
 * @param message - Error message
 * @param headers - Additional headers
 * @returns HTTP Response with rate limit information
 */
export function createRateLimitedResponse(
  message = "Rate limit exceeded",
  headers: Record<string, string> = {},
): Response {
  return new Response(
    JSON.stringify({ error: message }),
    {
      status: 429, // Too Many Requests
      headers: {
        "Content-Type": "application/json",
        ...headers,
      },
    }
  );
}
