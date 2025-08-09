/**
 * Development-only logging utility
 * - Logs are active in development mode
 * - Completely stripped from production builds via Vite tree-shaking
 * - Zero runtime overhead in production
 */

const isDev = import.meta.env.DEV;

export const logger = {
  /**
   * Debug logging - only active in development
   * @param args - Arguments to log
   */
  debug: (...args: any[]) => {
    if (isDev) {
      console.log(...args);
    }
  },

  /**
   * Info logging - only active in development
   * @param args - Arguments to log
   */
  info: (...args: any[]) => {
    if (isDev) {
      console.info(...args);
    }
  },

  /**
   * Warning logging - always active
   * @param args - Arguments to log
   */
  warn: (...args: any[]) => {
    console.warn(...args);
  },

  /**
   * Error logging - always active
   * @param args - Arguments to log
   */
  error: (...args: any[]) => {
    console.error(...args);
  },
};

/**
 * Simple debug logger function
 * Alias for logger.debug for shorter usage
 */
export const debugLog = logger.debug;
