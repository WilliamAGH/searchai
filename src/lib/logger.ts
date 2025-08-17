/**
 * Development-only logging utility
 * - Logs are active in development mode
 * - Completely stripped from production builds via Vite tree-shaking
 * - Zero runtime overhead in production
 */

import { isDev as checkIsDev } from "./environment";

export const logger = {
  /**
   * Debug logging - only active in development
   * @param args - Arguments to log
   */
  debug: (...args: unknown[]) => {
    if (import.meta.env.DEV && checkIsDev()) {
      console.info(...args);
    }
  },

  /**
   * Info logging - only active in development
   * @param args - Arguments to log
   */
  info: (...args: unknown[]) => {
    if (import.meta.env.DEV && checkIsDev()) {
      console.info(...args);
    }
  },

  /**
   * Warning logging - always active
   * @param args - Arguments to log
   */
  warn: (...args: unknown[]) => {
    console.warn(...args);
  },

  /**
   * Error logging - always active
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
