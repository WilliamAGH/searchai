/**
 * Rate limiting internal mutations
 * Handles atomic rate limit checking and incrementing
 */

import { internalMutation } from "./_generated/server";
import { v } from "convex/values";

/**
 * Atomically check and update rate limit counter
 * @param key - Unique identifier for the rate limit
 * @param maxRequests - Maximum number of requests allowed
 * @param windowMs - Time window in milliseconds
 * @returns Rate limit status and headers
 */
export const bumpAndCheck = internalMutation({
  args: {
    key: v.string(),
    maxRequests: v.number(),
    windowMs: v.number(),
  },
  returns: v.object({
    isRateLimited: v.boolean(),
    rateLimitHeaders: v.record(v.string(), v.string()),
  }),
  handler: async (
    ctx,
    { key, maxRequests, windowMs },
  ): Promise<{
    isRateLimited: boolean;
    rateLimitHeaders: Record<string, string>;
  }> => {
    // Validate inputs
    if (!Number.isFinite(windowMs) || windowMs <= 0) {
      throw new Error("windowMs must be a positive number");
    }
    if (!Number.isFinite(maxRequests)) {
      throw new Error("maxRequests must be a finite number");
    }
    if (maxRequests <= 0) {
      // Explicit "block all" mode
      const now = Date.now();
      return {
        isRateLimited: true,
        rateLimitHeaders: {
          "Retry-After": Math.ceil(windowMs / 1000).toString(),
          "X-RateLimit-Limit": "0",
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": Math.ceil((now + windowMs) / 1000).toString(),
        },
      };
    }

    const now = Date.now();
    const windowStart = now - windowMs;

    // Get existing rate limit entry
    const existing = await ctx.db
      .query("rateLimits")
      .withIndex("by_key", (q) => q.eq("key", key))
      .unique()
      .catch(() => null);

    let currentCount = 0;

    // If we have an existing entry and it's within the window, use its count
    if (existing && existing.lastRequest > windowStart) {
      currentCount = existing.count;
    }

    // If we're at or over the limit, reject the request
    if (currentCount >= maxRequests) {
      const last = existing?.lastRequest ?? now;
      const retryAfter = Math.max(
        0,
        Math.ceil((windowMs - (now - last)) / 1000),
      );
      return {
        isRateLimited: true,
        rateLimitHeaders: {
          "Retry-After": retryAfter.toString(),
          "X-RateLimit-Limit": String(maxRequests),
          "X-RateLimit-Remaining": "0",
          "X-RateLimit-Reset": Math.ceil((last + windowMs) / 1000).toString(),
        },
      };
    }

    // Increment the request count
    const newCount = currentCount + 1;

    if (existing) {
      await ctx.db.patch(existing._id, {
        count: newCount,
        lastRequest: now,
      });
    } else {
      await ctx.db.insert("rateLimits", {
        key,
        count: newCount,
        lastRequest: now,
      });
    }

    const remaining = maxRequests - newCount;
    const resetTime = Math.ceil((now + windowMs) / 1000);

    return {
      isRateLimited: false,
      rateLimitHeaders: {
        "X-RateLimit-Limit": String(maxRequests),
        "X-RateLimit-Remaining": String(remaining),
        "X-RateLimit-Reset": String(resetTime),
      },
    };
  },
});
