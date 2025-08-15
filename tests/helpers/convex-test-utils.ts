/**
 * Utilities for testing with Convex backend
 */

import { describe as vitestDescribe, it as vitestIt } from 'vitest';

/**
 * Check if Convex backend is available
 */
export async function isConvexAvailable(): Promise<boolean> {
  if (process.env.SKIP_BACKEND_TESTS === 'true') {
    return false;
  }
  
  try {
    // Try to fetch from Convex HTTP endpoint
    const response = await fetch('http://localhost:3210/.well-known/openapi.json', {
      method: 'GET',
      signal: AbortSignal.timeout(1000), // 1 second timeout
    }).catch(() => null);
    
    return response?.ok ?? false;
  } catch {
    return false;
  }
}

/**
 * Conditional describe that only runs if Convex backend is available
 */
export const describeWithBackend = (
  name: string,
  fn: () => void
) => {
  return vitestDescribe(name, () => {
    vitestIt.skipIf(!isConvexAvailable())('requires Convex backend', () => {
      console.log('⚠️ Skipping tests that require Convex backend. Run with: npm run test:integration:with-backend');
    });
    
    if (process.env.CONVEX_URL || process.env.CI) {
      fn();
    }
  });
};

/**
 * Conditional it that only runs if Convex backend is available
 */
export const itWithBackend = (
  name: string,
  fn: () => void | Promise<void>
) => {
  return vitestIt.skipIf(!isConvexAvailable())(name, fn);
};
