/**
 * Environment detection utilities for frontend
 *
 * @module src/lib/environment
 * @description
 * Provides unified environment detection for the frontend application.
 * Uses multiple signals including Vite's built-in flags, URL patterns,
 * and deployment names to reliably detect the current environment.
 *
 * @example
 * ```typescript
 * import { isDev, environment } from '@/lib/environment';
 *
 * if (isDev()) {
 *   console.log('Running in development');
 * }
 *
 * // Or use the singleton
 * if (environment.isDev) {
 *   enableDebugMode();
 * }
 * ```
 */

// Known deployment identifiers (same as backend)
// TODO: REDUNDANCY ALERT - Consider extracting shared deployments list
// into a neutral shared module to avoid drift with convex/lib/environment.ts
const DEV_DEPLOYMENTS = ["diligent-greyhound-240", "localhost", "local"];

const PROD_DEPLOYMENTS = ["vivid-boar-858"];

/**
 * Primary environment detection for frontend.
 * Uses multiple signals to determine environment with fallback chain.
 *
 * @returns {boolean} True if in development environment
 *
 * Detection order:
 * 1. Vite's DEV flag (most reliable during dev)
 * 2. Localhost detection
 * 3. Convex deployment name matching
 * 4. Vite MODE environment variable
 * 5. Default to production (safe)
 *
 * @example
 * ```typescript
 * if (isDevelopment()) {
 *   // Enable development features
 *   import('./devtools').then(({ enableDevTools }) => {
 *     enableDevTools();
 *   });
 * }
 * ```
 */
export function isDevelopment(): boolean {
  // 1. Check Vite's built-in DEV flag (most reliable during dev)
  if (import.meta.env.DEV) {
    return true;
  }

  // 2. Check if we're on localhost or private network ranges
  if (typeof window !== "undefined") {
    const hostname = window.location.hostname;
    const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
    const is10 = /^10\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(hostname);
    const is192 = /^192\.168\.\d{1,3}\.\d{1,3}$/.test(hostname);
    const is172 = /^172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}$/.test(hostname);
    if (isLocalHost || is10 || is192 || is172) {
      return true;
    }
  }

  // 3. Check Convex URL for deployment name
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (convexUrl) {
    const deployment = getDeploymentFromUrl(convexUrl);
    if (deployment && DEV_DEPLOYMENTS.some((dev) => deployment.includes(dev))) {
      return true;
    }
    if (
      deployment &&
      PROD_DEPLOYMENTS.some((prod) => deployment.includes(prod))
    ) {
      return false;
    }
  }

  // 4. Check MODE (Vite build mode)
  if (import.meta.env.MODE === "development") {
    return true;
  }

  // Default to production for safety
  return false;
}

/**
 * Extract deployment name from Convex URL.
 *
 * @param {string} url - Convex URL to parse
 * @returns {string | null} Deployment name or null if not a Convex URL
 *
 * @example
 * ```typescript
 * const deployment = getDeploymentFromUrl(import.meta.env.VITE_CONVEX_URL);
 * console.log(deployment); // 'diligent-greyhound-240'
 * ```
 */
export function getDeploymentFromUrl(url: string): string | null {
  try {
    const urlObj = new URL(url);
    if (urlObj.hostname.endsWith(".convex.cloud")) {
      return urlObj.hostname.split(".")[0];
    }
    if (urlObj.hostname === "localhost" || urlObj.hostname === "127.0.0.1") {
      return "localhost";
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Get current deployment name for passing to backend.
 * Useful for providing deployment hints to Convex queries/mutations.
 *
 * @returns {string} Current deployment name or MODE fallback
 *
 * @example
 * ```typescript
 * import { getCurrentDeployment } from '@/lib/environment';
 * import { useMutation } from 'convex/react';
 *
 * const mutation = useMutation(api.myMutation);
 * await mutation({
 *   deployment: getCurrentDeployment() // Pass hint to backend
 * });
 * ```
 */
export function getCurrentDeployment(): string {
  const convexUrl = import.meta.env.VITE_CONVEX_URL;
  if (convexUrl) {
    const deployment = getDeploymentFromUrl(convexUrl);
    if (deployment) return deployment;
  }

  // Fallback to MODE
  return import.meta.env.MODE || "production";
}

/**
 * Get environment-aware console logger.
 * In production, only errors and warnings are logged.
 *
 * @returns {Object} Logger with log, error, warn, debug, info methods
 *
 * @example
 * ```typescript
 * const logger = getEnvLogger();
 * logger.debug('This only logs in development');
 * logger.error('This always logs'); // Errors always visible
 * ```
 */
export function getEnvLogger() {
  const isDev = isDevelopment();

  if (isDev) {
    return {
      log: console.info.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      debug: console.info.bind(console, "[DEBUG]"),
      info: console.info.bind(console),
    };
  }

  // In production, only allow error and warn
  const noop = () => {};
  return {
    log: noop,
    error: console.error.bind(console),
    warn: console.warn.bind(console),
    debug: noop,
    info: noop,
  };
}

/**
 * Singleton instance for consistent environment detection.
 * Caches environment state to avoid repeated calculations.
 *
 * @class Environment
 * @example
 * ```typescript
 * import { environment } from '@/lib/environment';
 *
 * // Use cached values
 * if (environment.isDev) {
 *   console.log(`Running in dev on ${environment.deployment}`);
 * }
 *
 * // Force refresh if needed (e.g., after config change)
 * environment.refresh();
 * ```
 */
class Environment {
  private _isDev: boolean | null = null;
  private _deployment: string | null = null;

  get isDev(): boolean {
    if (this._isDev === null) {
      this._isDev = isDevelopment();
    }
    return this._isDev;
  }

  get deployment(): string {
    if (this._deployment === null) {
      this._deployment = getCurrentDeployment();
    }
    return this._deployment;
  }

  get isProduction(): boolean {
    return !this.isDev;
  }

  // Force refresh (useful for testing)
  refresh(): void {
    this._isDev = null;
    this._deployment = null;
  }
}

// Export singleton instance
export const environment = new Environment();

/**
 * Check if running in development environment.
 * @returns {boolean} True if in development
 */
export const isDev = () => environment.isDev;

/**
 * Check if running in production environment.
 * @returns {boolean} True if in production
 */
export const isProduction = () => environment.isProduction;

/**
 * Get current deployment name.
 * @returns {string} Deployment name
 */
export const getDeployment = () => environment.deployment;
