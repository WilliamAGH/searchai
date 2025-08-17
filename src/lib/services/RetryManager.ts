/**
 * Retry Manager
 * Handles retry logic with exponential backoff and circuit breaker pattern
 */

import { logger } from '../logger';

export interface RetryOptions {
  maxAttempts?: number;
  initialDelay?: number;
  maxDelay?: number;
  backoffFactor?: number;
  jitter?: boolean;
  timeout?: number;
  onRetry?: (attempt: number, error: Error) => void;
  shouldRetry?: (error: Error) => boolean;
}

interface RetryStats {
  attempts: number;
  failures: number;
  successes: number;
  lastError?: Error;
  lastAttempt?: Date;
}

/**
 * Retry Manager
 * Provides retry functionality with exponential backoff
 */
export class RetryManager {
  private static instance: RetryManager;
  private stats: Map<string, RetryStats> = new Map();
  private circuitBreakers: Map<string, CircuitBreaker> = new Map();

  private constructor() {}

  static getInstance(): RetryManager {
    if (!RetryManager.instance) {
      RetryManager.instance = new RetryManager();
    }
    return RetryManager.instance;
  }

  /**
   * Execute a function with retry logic
   */
  async retry<T>(
    fn: () => Promise<T>,
    options: RetryOptions = {},
    key?: string
  ): Promise<T> {
    const {
      maxAttempts = 3,
      initialDelay = 1000,
      maxDelay = 30000,
      backoffFactor = 2,
      jitter = true,
      timeout,
      onRetry,
      shouldRetry = this.defaultShouldRetry,
    } = options;

    // Check circuit breaker if key provided
    if (key) {
      const breaker = this.getCircuitBreaker(key);
      if (!breaker.canAttempt()) {
        throw new Error(`Circuit breaker open for: ${key}`);
      }
    }

    let lastError: Error | null = null;
    let delay = initialDelay;

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        // Update stats
        if (key) {
          this.updateStats(key, 'attempt');
        }

        // Execute with optional timeout
        const result = timeout
          ? await this.withTimeout(fn(), timeout)
          : await fn();

        // Success - update stats and reset circuit breaker
        if (key) {
          this.updateStats(key, 'success');
          this.getCircuitBreaker(key).recordSuccess();
        }

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Update stats
        if (key) {
          this.updateStats(key, 'failure', lastError);
          this.getCircuitBreaker(key).recordFailure();
        }

        // Check if we should retry
        if (!shouldRetry(lastError)) {
          logger.debug('Error is not retryable', {
            error: lastError.message,
            attempt,
          });
          throw lastError;
        }

        // Check if we have more attempts
        if (attempt >= maxAttempts) {
          logger.error('Max retry attempts reached', {
            maxAttempts,
            error: lastError.message,
            key,
          });
          throw lastError;
        }

        // Calculate delay with optional jitter
        const actualDelay = jitter
          ? delay * (0.5 + Math.random())
          : delay;

        logger.info(`Retry attempt ${attempt}/${maxAttempts}`, {
          delay: actualDelay,
          error: lastError.message,
          key,
        });

        // Call retry callback if provided
        if (onRetry) {
          onRetry(attempt, lastError);
        }

        // Wait before retrying
        await this.sleep(Math.min(actualDelay, maxDelay));

        // Increase delay for next attempt
        delay *= backoffFactor;
      }
    }

    throw lastError || new Error('Retry failed');
  }

  /**
   * Execute multiple operations with retry
   */
  async retryBatch<T>(
    operations: Array<() => Promise<T>>,
    options: RetryOptions = {}
  ): Promise<Array<{ success: boolean; result?: T; error?: Error }>> {
    const results = await Promise.allSettled(
      operations.map(op => this.retry(op, options))
    );

    return results.map(result => {
      if (result.status === 'fulfilled') {
        return { success: true, result: result.value };
      } else {
        return { success: false, error: result.reason };
      }
    });
  }

  /**
   * Get retry statistics for a key
   */
  getStats(key: string): RetryStats | undefined {
    return this.stats.get(key);
  }

  /**
   * Clear statistics for a key
   */
  clearStats(key?: string): void {
    if (key) {
      this.stats.delete(key);
      this.circuitBreakers.delete(key);
    } else {
      this.stats.clear();
      this.circuitBreakers.clear();
    }
  }

  /**
   * Get or create circuit breaker for a key
   */
  private getCircuitBreaker(key: string): CircuitBreaker {
    let breaker = this.circuitBreakers.get(key);
    if (!breaker) {
      breaker = new CircuitBreaker(key);
      this.circuitBreakers.set(key, breaker);
    }
    return breaker;
  }

  /**
   * Update statistics
   */
  private updateStats(
    key: string,
    type: 'attempt' | 'success' | 'failure',
    error?: Error
  ): void {
    const stats = this.stats.get(key) || {
      attempts: 0,
      failures: 0,
      successes: 0,
    };

    stats.attempts++;
    stats.lastAttempt = new Date();

    if (type === 'success') {
      stats.successes++;
    } else if (type === 'failure') {
      stats.failures++;
      stats.lastError = error;
    }

    this.stats.set(key, stats);
  }

  /**
   * Default retry condition
   */
  private defaultShouldRetry(error: Error): boolean {
    // Retry on network errors
    if (error.message.includes('network') || error.message.includes('fetch')) {
      return true;
    }

    // Retry on timeout errors
    if (error.message.includes('timeout')) {
      return true;
    }

    // Retry on specific HTTP status codes (if available)
    const statusMatch = error.message.match(/status[:\s]+(\d+)/i);
    if (statusMatch) {
      const status = parseInt(statusMatch[1]);
      // Retry on 429 (rate limit), 502 (bad gateway), 503 (service unavailable), 504 (gateway timeout)
      return [429, 502, 503, 504].includes(status);
    }

    // Don't retry on other errors
    return false;
  }

  /**
   * Add timeout to a promise
   */
  private withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    return new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      promise
        .then(result => {
          clearTimeout(timeoutId);
          resolve(result);
        })
        .catch(error => {
          clearTimeout(timeoutId);
          reject(error);
        });
    });
  }

  /**
   * Sleep for specified milliseconds
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

/**
 * Circuit Breaker
 * Prevents repeated failures by temporarily blocking requests
 */
class CircuitBreaker {
  private readonly key: string;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private failures: number = 0;
  private lastFailureTime?: Date;
  private readonly threshold: number = 5;
  private readonly timeout: number = 60000; // 1 minute

  constructor(key: string) {
    this.key = key;
  }

  canAttempt(): boolean {
    if (this.state === 'closed') {
      return true;
    }

    if (this.state === 'open') {
      // Check if timeout has passed
      if (this.lastFailureTime) {
        const elapsed = Date.now() - this.lastFailureTime.getTime();
        if (elapsed > this.timeout) {
          this.state = 'half-open';
          logger.info(`Circuit breaker half-open for: ${this.key}`);
          return true;
        }
      }
      return false;
    }

    // Half-open state - allow one attempt
    return true;
  }

  recordSuccess(): void {
    if (this.state === 'half-open') {
      logger.info(`Circuit breaker closed for: ${this.key}`);
    }
    this.state = 'closed';
    this.failures = 0;
    this.lastFailureTime = undefined;
  }

  recordFailure(): void {
    this.failures++;
    this.lastFailureTime = new Date();

    if (this.state === 'half-open') {
      this.state = 'open';
      logger.warn(`Circuit breaker reopened for: ${this.key}`);
    } else if (this.failures >= this.threshold) {
      this.state = 'open';
      logger.warn(`Circuit breaker opened for: ${this.key}`, {
        failures: this.failures,
        threshold: this.threshold,
      });
    }
  }
}

// Export singleton instance
export const retryManager = RetryManager.getInstance();

/**
 * Decorator for adding retry logic to class methods
 */
export function withRetry(options: RetryOptions = {}) {
  return function (
    target: any,
    propertyKey: string,
    descriptor: PropertyDescriptor
  ) {
    const originalMethod = descriptor.value;

    descriptor.value = async function (...args: any[]) {
      const key = `${target.constructor.name}.${propertyKey}`;
      return retryManager.retry(
        () => originalMethod.apply(this, args),
        options,
        key
      );
    };

    return descriptor;
  };
}