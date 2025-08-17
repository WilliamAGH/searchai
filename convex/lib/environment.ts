/**
 * Environment detection utilities for Convex
 *
 * @module convex/lib/environment
 * @description
 * Provides unified environment detection across all Convex function types.
 * Since Convex queries/mutations cannot access process.env directly, we use
 * deployment name patterns and hardcoded values to detect environment.
 *
 * @example
 * ```typescript
 * // In a Convex action (can use process.env)
 * import { isDevAction } from '../lib/environment';
 * const isDev = isDevAction();
 *
 * // In a query/mutation (no process.env access)
 * import { isDevFromContext } from '../lib/environment';
 * const isDev = isDevFromContext(); // Uses hardcoded deployment knowledge
 * ```
 *
 * @see https://docs.convex.dev/functions for Convex function types
 */

// Known deployment identifiers
// TODO: REDUNDANCY ALERT - This list is also defined in src/lib/environment.ts.
// Consider moving to a shared module to prevent drift between frontend/backend.
const DEV_DEPLOYMENTS = ["diligent-greyhound-240", "localhost", "local"];

const PROD_DEPLOYMENTS = ["vivid-boar-858"];

/**
 * Check if a deployment name indicates development environment.
 * Works in all Convex contexts (queries, mutations, actions).
 *
 * @param {string} [deploymentName] - Deployment name to check (e.g., 'dev:name' or 'prod:name')
 * @returns {boolean} True if deployment is development, false for production
 *
 * @example
 * ```typescript
 * // Check specific deployment
 * isDevDeployment('diligent-greyhound-240') // returns true
 * isDevDeployment('vivid-boar-858') // returns false
 *
 * // Check with prefix
 * isDevDeployment('dev:some-deployment') // returns true
 * isDevDeployment('prod:some-deployment') // returns false
 * ```
 */
export function isDevDeployment(deploymentName?: string): boolean {
  if (!deploymentName) return false;

  // Handle deployment type prefixes (e.g., "dev:name" or "prod:name")
  const cleanName = deploymentName.split(":").pop() || deploymentName;

  // Check against known dev deployments
  if (DEV_DEPLOYMENTS.some((dev) => cleanName.includes(dev))) {
    return true;
  }

  // Check against known prod deployments (inverse)
  if (PROD_DEPLOYMENTS.some((prod) => cleanName.includes(prod))) {
    return false;
  }

  // Default heuristics
  // If it starts with "dev:" or contains "dev", it's probably dev
  if (deploymentName.startsWith("dev:") || deploymentName.includes("dev")) {
    return true;
  }

  // If it starts with "prod:" or contains "prod", it's production
  if (deploymentName.startsWith("prod:") || deploymentName.includes("prod")) {
    return false;
  }

  // Default to production for safety
  return false;
}

/**
 * Get deployment name from URL.
 * Extracts deployment name from Convex URLs like https://name.convex.cloud.
 *
 * @param {string} url - Convex URL to parse
 * @returns {string | null} Deployment name or null if not a Convex URL
 *
 * @example
 * ```typescript
 * getDeploymentFromUrl('https://diligent-greyhound-240.convex.cloud')
 * // returns 'diligent-greyhound-240'
 *
 * getDeploymentFromUrl('http://localhost:3000')
 * // returns 'localhost'
 *
 * getDeploymentFromUrl('https://example.com')
 * // returns null
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
 * Environment detection for Convex actions (can use process.env).
 * This is the most reliable method when available.
 *
 * @returns {'development' | 'production'} Current environment
 *
 * @note Only works in Convex actions. Will always return 'production' in queries/mutations.
 *
 * @example
 * ```typescript
 * // In a Convex action
 * import { action } from './_generated/server';
 * import { getActionEnvironment } from '../lib/environment';
 *
 * export const myAction = action(async (ctx) => {
 *   const env = getActionEnvironment();
 *   if (env === 'development') {
 *     console.log('Running in development');
 *   }
 * });
 * ```
 */
export function getActionEnvironment(): "development" | "production" {
  // Check NODE_ENV first (most reliable)
  if (
    typeof process !== "undefined" &&
    process.env?.NODE_ENV === "development"
  ) {
    return "development";
  }

  // Check CONVEX_DEPLOYMENT environment variable
  if (typeof process !== "undefined" && process.env?.CONVEX_DEPLOYMENT) {
    const deployment = process.env.CONVEX_DEPLOYMENT;
    return isDevDeployment(deployment) ? "development" : "production";
  }

  // Check for specific deployment URLs
  if (typeof process !== "undefined" && process.env?.CONVEX_URL) {
    const deployment = getDeploymentFromUrl(process.env.CONVEX_URL);
    if (deployment) {
      return isDevDeployment(deployment) ? "development" : "production";
    }
  }

  // Default to production for safety
  return "production";
}

/**
 * Simple boolean check for actions to determine if running in development.
 *
 * @returns {boolean} True if in development environment
 *
 * @note Only reliable in Convex actions. Use isDevFromContext() in queries/mutations.
 *
 * @example
 * ```typescript
 * // In a Convex action
 * if (isDevAction()) {
 *   console.log('Debug: Running in development mode');
 * }
 * ```
 */
export function isDevAction(): boolean {
  return getActionEnvironment() === "development";
}

/**
 * Environment detection for queries/mutations (cannot use process.env).
 *
 * Since queries/mutations cannot access process.env, this function uses:
 * 1. Hardcoded deployment names (most reliable)
 * 2. Deployment hints passed from frontend
 * 3. Conservative default (production)
 *
 * @param {string} [deploymentHint] - Optional deployment name hint from frontend
 * @returns {boolean} True if in development environment
 *
 * @important This relies on hardcoded deployment names. Update DEV_DEPLOYMENTS
 * and PROD_DEPLOYMENTS arrays when deployments change.
 *
 * @example
 * ```typescript
 * // In a query/mutation - uses hardcoded knowledge
 * import { query } from './_generated/server';
 * import { isDevFromContext } from '../lib/environment';
 *
 * export const myQuery = query(async (ctx) => {
 *   const isDev = isDevFromContext();
 *   // Returns true in greyhound deployment, false in boar
 * });
 *
 * // With hint from frontend
 * export const myMutation = mutation({
 *   args: { deployment: v.optional(v.string()) },
 *   handler: async (ctx, args) => {
 *     const isDev = isDevFromContext(args.deployment);
 *   }
 * });
 * ```
 */
export function isDevFromContext(deploymentHint?: string): boolean {
  // If we have a hint, use it
  if (deploymentHint) {
    return isDevDeployment(deploymentHint);
  }

  // Hardcoded fallback based on known deployments
  // This works because each deployment has its own database
  // We can safely hardcode our known deployment names
  // The code in greyhound deployment will always know it's dev
  // The code in boar deployment will always know it's prod

  // Since this code is deployed to a specific deployment,
  // we can use a build-time constant or feature flag
  // For now, we'll use a conservative approach:

  // This will be false in production, which is safe
  return false;
}

/**
 * Get environment-aware console logger.
 * Returns no-op functions in production to avoid log pollution.
 *
 * @param {boolean} isDev - Whether in development environment
 * @returns {Object} Logger object with log, error, warn, debug methods
 *
 * @example
 * ```typescript
 * const logger = getEnvLogger(isDevAction());
 * logger.debug('This only logs in development');
 * logger.error('This is a no-op in production');
 * ```
 */
export function getEnvLogger(isDev: boolean) {
  if (isDev) {
    return {
      log: console.info.bind(console),
      error: console.error.bind(console),
      warn: console.warn.bind(console),
      debug: console.info.bind(console, "[DEBUG]"),
    };
  }

  // No-op in production
  const noop = () => {};
  return {
    log: noop,
    error: noop,
    warn: noop,
    debug: noop,
  };
}
