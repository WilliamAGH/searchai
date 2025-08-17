/**
 * Backend logging utility for Convex functions
 * - Logs are active in development mode
 * - Completely stripped from production builds
 * - Zero runtime overhead in production
 * - Safe for server-side execution
 */

import { isDevAction, isDevFromContext } from "./environment";

// Determine if we're in development mode
// This works differently depending on the Convex context:
// - In actions: Can use process.env directly via isDevAction()
// - In queries/mutations: Must use context hints or hardcoded values
const isDev = (() => {
  // Try action-based detection first (most reliable when available)
  try {
    if (typeof process !== "undefined" && typeof process.env !== "undefined") {
      return isDevAction();
    }
  } catch {
    // Not in an action context
  }

  // Fallback to context-based detection
  // In queries/mutations, we can't access process.env
  // So we use hardcoded knowledge of our deployment
  return isDevFromContext();
})();

export const logger = {
  /**
   * Debug logging - only active in development
   * @param args - Arguments to log
   */
  debug: (...args: unknown[]) => {
    // In production, this will be a no-op
    // In development, this provides useful debugging info
    if (isDev) {
      console.debug(...args);
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
