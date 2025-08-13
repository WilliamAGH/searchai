// Minimal HTTP utilities for frontend operations
// These do NOT duplicate Convex functionality - they're for non-Convex HTTP operations

export function buildApiBase(convexUrl: string): string {
  // For non-Convex API endpoints
  return convexUrl.replace("/api", "");
}

export function resolveApiPath(base: string, path: string): string {
  // For non-Convex API paths
  return `${base}${path}`;
}

export async function fetchJsonWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
): Promise<any> {
  // For non-Convex HTTP requests that need retry logic
  let lastError: Error | null = null;

  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch(url, options);
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`);
      }
      return await response.json();
    } catch (error) {
      lastError = error as Error;
      if (i < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i)),
        );
      }
    }
  }

  throw lastError;
}
