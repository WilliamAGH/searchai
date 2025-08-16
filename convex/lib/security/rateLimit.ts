/**
 * Rate limiting module for HTTP endpoints
 * Prevents abuse of unauthenticated API endpoints
 */

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
const _DEFAULT_LIMITS: Record<string, RateLimitConfig> = {
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

// Note: checkRateLimit function removed to avoid TypeScript deep instantiation issues
// HTTP actions should call internal.rateLimits.bumpAndCheck directly

/**
 * Get client IP address from request
 * @param request - HTTP request
 * @returns IP address as string
 */
export function getClientIP(request: Request): string {
  // Try to get IP from headers (in order of preference)
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    // x-forwarded-for can contain multiple IPs, take the first one
    return xForwardedFor.split(",")[0].trim();
  }

  const xRealIP = request.headers.get("x-real-ip");
  if (xRealIP) {
    return xRealIP;
  }

  const forwarded = request.headers.get("forwarded");
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
  return new Response(JSON.stringify({ error: message }), {
    status: 429, // Too Many Requests
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      Vary: "Origin",
      ...headers,
    },
  });
}
