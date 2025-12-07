// Minimal HTTP utilities for frontend operations
// These do NOT duplicate Convex functionality - they're for non-Convex HTTP operations

export function buildApiBase(convexUrl: string): string {
  // Derive the Convex HTTP base (https://<deployment>.convex.site) from the
  // Convex client URL (typically https://<deployment>.convex.cloud).
  // Returns the origin without a trailing slash; caller should append paths.
  try {
    if (!convexUrl) return "";
    const url = new URL(convexUrl);
    const siteHost = url.host.replace(".convex.cloud", ".convex.site");
    return `${url.protocol}//${siteHost}`.replace(/\/$/, "");
  } catch {
    // Fallback: return input without trailing /api if parsing fails
    return convexUrl.replace("/api", "");
  }
}

export function resolveApiPath(base: string, path: string): string {
  // For non-Convex API paths
  return `${base}${path}`;
}

export async function fetchJsonWithRetry(
  url: string,
  options?: RequestInit,
  maxRetries = 3,
): Promise<unknown> {
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

  throw lastError ?? new Error("Unknown HTTP error");
}
