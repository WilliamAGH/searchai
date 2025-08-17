/**
 * Rate Limiter
 * Manages API request rates to prevent throttling
 */

import { logger } from '../logger';

interface RateLimitConfig {
  maxRequests: number;
  windowMs: number;
  key?: string;
}

interface RateLimitState {
  requests: number;
  windowStart: number;
  queue: Array<() => void>;
  isThrottled: boolean;
}

interface RateLimitStats {
  totalRequests: number;
  throttledRequests: number;
  queuedRequests: number;
  averageWaitTime: number;
}

/**
 * Rate Limiter
 * Implements token bucket algorithm with queuing
 */
export class RateLimiter {
  private static instance: RateLimiter;
  private limits: Map<string, RateLimitConfig> = new Map();
  private states: Map<string, RateLimitState> = new Map();
  private stats: Map<string, RateLimitStats> = new Map();

  private constructor() {
    this.initializeDefaultLimits();
  }

  static getInstance(): RateLimiter {
    if (!RateLimiter.instance) {
      RateLimiter.instance = new RateLimiter();
    }
    return RateLimiter.instance;
  }

  /**
   * Initialize default rate limits
   */
  private initializeDefaultLimits() {
    // OpenRouter API limits
    this.setLimit('openrouter', {
      maxRequests: 60,
      windowMs: 60000, // 60 requests per minute
    });

    // SERP API limits
    this.setLimit('serpapi', {
      maxRequests: 100,
      windowMs: 60000, // 100 requests per minute
    });

    // Search planner limits
    this.setLimit('search-planner', {
      maxRequests: 10,
      windowMs: 60000, // 10 requests per minute
    });

    // AI generation limits
    this.setLimit('ai-generation', {
      maxRequests: 20,
      windowMs: 60000, // 20 requests per minute
    });

    // Web scraping limits
    this.setLimit('scraping', {
      maxRequests: 30,
      windowMs: 60000, // 30 requests per minute
    });
  }

  /**
   * Set rate limit for a key
   */
  setLimit(key: string, config: RateLimitConfig): void {
    this.limits.set(key, { ...config, key });
    this.states.set(key, {
      requests: 0,
      windowStart: Date.now(),
      queue: [],
      isThrottled: false,
    });
    this.stats.set(key, {
      totalRequests: 0,
      throttledRequests: 0,
      queuedRequests: 0,
      averageWaitTime: 0,
    });

    logger.debug(`Rate limit configured for: ${key}`, config);
  }

  /**
   * Check if request can proceed
   */
  async checkLimit(key: string): Promise<boolean> {
    const config = this.limits.get(key);
    const state = this.states.get(key);

    if (!config || !state) {
      // No limit configured - allow
      return true;
    }

    const now = Date.now();
    const windowElapsed = now - state.windowStart;

    // Reset window if expired
    if (windowElapsed >= config.windowMs) {
      state.requests = 0;
      state.windowStart = now;
      state.isThrottled = false;
      
      // Process queued requests
      this.processQueue(key);
    }

    // Check if under limit
    if (state.requests < config.maxRequests) {
      state.requests++;
      this.updateStats(key, 'allowed');
      return true;
    }

    // Over limit - throttle
    state.isThrottled = true;
    this.updateStats(key, 'throttled');

    logger.warn(`Rate limit exceeded for: ${key}`, {
      requests: state.requests,
      maxRequests: config.maxRequests,
      windowMs: config.windowMs,
      queueSize: state.queue.length,
    });

    return false;
  }

  /**
   * Wait for rate limit to allow request
   */
  async waitForLimit(key: string, timeout?: number): Promise<void> {
    const config = this.limits.get(key);
    const state = this.states.get(key);

    if (!config || !state) {
      // No limit configured - proceed immediately
      return;
    }

    // Check if we can proceed immediately
    const canProceed = await this.checkLimit(key);
    if (canProceed) {
      return;
    }

    // Calculate wait time
    const now = Date.now();
    const windowElapsed = now - state.windowStart;
    const remainingTime = Math.max(0, config.windowMs - windowElapsed);

    // Check timeout
    if (timeout && remainingTime > timeout) {
      throw new Error(`Rate limit wait time (${remainingTime}ms) exceeds timeout (${timeout}ms)`);
    }

    // Add to queue and wait
    return new Promise<void>((resolve, reject) => {
      const queueEntry = () => {
        this.checkLimit(key).then(allowed => {
          if (allowed) {
            resolve();
          } else {
            // Should not happen, but handle it
            reject(new Error('Rate limit check failed after waiting'));
          }
        }).catch(error => {
          reject(error);
        });
      };

      state.queue.push(queueEntry);
      this.updateStats(key, 'queued');

      logger.info(`Request queued for rate limit: ${key}`, {
        queuePosition: state.queue.length,
        estimatedWait: remainingTime,
      });

      // Set timeout for queue entry
      if (timeout) {
        setTimeout(() => {
          const index = state.queue.indexOf(queueEntry);
          if (index > -1) {
            state.queue.splice(index, 1);
            reject(new Error(`Rate limit queue timeout after ${timeout}ms`));
          }
        }, timeout);
      }
    });
  }

  /**
   * Execute function with rate limiting
   */
  async execute<T>(
    key: string,
    fn: () => Promise<T>,
    options: { timeout?: number; priority?: number } = {}
  ): Promise<T> {
    await this.waitForLimit(key, options.timeout);
    return fn();
  }

  /**
   * Execute batch with rate limiting
   */
  async executeBatch<T>(
    key: string,
    fns: Array<() => Promise<T>>,
    options: { timeout?: number; concurrency?: number } = {}
  ): Promise<T[]> {
    const { concurrency = 1 } = options;
    const results: T[] = [];
    
    // Process in batches
    for (let i = 0; i < fns.length; i += concurrency) {
      const batch = fns.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(fn => this.execute(key, fn, options))
      );
      results.push(...batchResults);
    }

    return results;
  }

  /**
   * Get rate limit status
   */
  getStatus(key: string): {
    remaining: number;
    resetIn: number;
    isThrottled: boolean;
    queueLength: number;
  } | null {
    const config = this.limits.get(key);
    const state = this.states.get(key);

    if (!config || !state) {
      return null;
    }

    const now = Date.now();
    const windowElapsed = now - state.windowStart;
    const resetIn = Math.max(0, config.windowMs - windowElapsed);
    const remaining = Math.max(0, config.maxRequests - state.requests);

    return {
      remaining,
      resetIn,
      isThrottled: state.isThrottled,
      queueLength: state.queue.length,
    };
  }

  /**
   * Get statistics for a key
   */
  getStats(key: string): RateLimitStats | undefined {
    return this.stats.get(key);
  }

  /**
   * Reset rate limit for a key
   */
  reset(key: string): void {
    const state = this.states.get(key);
    if (state) {
      state.requests = 0;
      state.windowStart = Date.now();
      state.isThrottled = false;
      
      // Process any queued requests
      this.processQueue(key);
    }
  }

  /**
   * Clear all rate limits
   */
  clearAll(): void {
    for (const [_key, state] of this.states.entries()) {
      // Reject all queued requests
      state.queue.forEach(resolve => resolve());
      state.queue = [];
    }
    
    this.limits.clear();
    this.states.clear();
    this.stats.clear();
  }

  /**
   * Process queued requests
   */
  private processQueue(key: string): void {
    const state = this.states.get(key);
    if (!state || state.queue.length === 0) {
      return;
    }

    // Process all queued requests
    const queue = [...state.queue];
    state.queue = [];

    logger.info(`Processing ${queue.length} queued requests for: ${key}`);

    queue.forEach(resolve => resolve());
  }

  /**
   * Update statistics
   */
  private updateStats(
    key: string,
    type: 'allowed' | 'throttled' | 'queued'
  ): void {
    const stats = this.stats.get(key);
    if (!stats) return;

    stats.totalRequests++;

    if (type === 'throttled') {
      stats.throttledRequests++;
    } else if (type === 'queued') {
      stats.queuedRequests++;
    }
  }
}

// Export singleton instance
export const rateLimiter = RateLimiter.getInstance();

/**
 * React hook for rate limiting
 */
export function useRateLimit(key: string) {
  const [status, setStatus] = React.useState<{
    remaining: number;
    resetIn: number;
    isThrottled: boolean;
  } | null>(null);

  React.useEffect(() => {
    const updateStatus = () => {
      const currentStatus = rateLimiter.getStatus(key);
      if (currentStatus) {
        setStatus({
          remaining: currentStatus.remaining,
          resetIn: currentStatus.resetIn,
          isThrottled: currentStatus.isThrottled,
        });
      }
    };

    // Update immediately
    updateStatus();

    // Update every second
    const interval = setInterval(updateStatus, 1000);

    return () => clearInterval(interval);
  }, [key]);

  const execute = React.useCallback(
    async <T,>(fn: () => Promise<T>): Promise<T> => {
      return rateLimiter.execute(key, fn);
    },
    [key]
  );

  return {
    status,
    execute,
    checkLimit: () => rateLimiter.checkLimit(key),
    waitForLimit: (timeout?: number) => rateLimiter.waitForLimit(key, timeout),
  };
}

// Import React for the hook
import React from 'react';