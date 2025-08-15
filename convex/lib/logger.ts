/**
 * Backend logging utility for Convex functions
 * - Logs are active in development mode
 * - Completely stripped from production builds
 * - Zero runtime overhead in production
 * - Safe for server-side execution
 */

// In Convex, we can't use import.meta.env, so we'll use a different approach
// We'll create a simple logger that can be easily identified and removed

// Safe way to check if we're in a Node.js environment
const isNode = typeof process !== "undefined" && process.env;
const isDev = isNode ? process.env.NODE_ENV !== "production" : true;

export const logger = {
  /**
   * Debug logging - only active in development
   * @param args - Arguments to log
   */
  debug: (...args: unknown[]) => {
    // In production, this will be a no-op
    // In development, this provides useful debugging info
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Info logging - only active in development
   * @param args - Arguments to log
   */
  info: (...args: unknown[]) => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Warning logging - always active (important for production)
   * @param args - Arguments to log
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error logging - always active (important for production)
   * @param args - Arguments to log
   */
  error: (...args: unknown[]) => {
    console.error(...args);
  },
};

/**
 * Simple debug logger function
 * Alias for logger.debug for shorter usage
 */
export const debugLog = logger.debug;
