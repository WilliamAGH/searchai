// Minimal HTTP utilities for frontend operations
// These do NOT duplicate Convex functionality - they're for non-Convex HTTP operations

import { getErrorMessage } from "./errorUtils";

export function buildApiBase(convexUrl: string): string {
  // Derive the Convex HTTP base (https://<deployment>.convex.site) from the
  // Convex client URL (typically https://<deployment>.convex.cloud).
  // Returns the origin without a trailing slash; caller should append paths.
  try {
    if (!convexUrl) return "";
    const url = new URL(convexUrl);
    const siteHost = url.host.replace(".convex.cloud", ".convex.site");
    return `${url.protocol}//${siteHost}`.replace(/\/$/, "");
  } catch (error) {
    // Fallback: return input without trailing /api if parsing fails
    console.error("Failed to parse Convex URL for API base", {
      convexUrl,
      error,
    });
    return convexUrl.replace("/api", "");
  }
}

export function resolveApiPath(base: string, path: string): string {
  // For non-Convex API paths
  return `${base}${path}`;
}

export type HttpErrorDetails = {
  status: number;
  statusText: string;
  url: string;
  body: string;
  headers: Record<string, string>;
};

export async function readResponseBody(response: Response): Promise<string> {
  try {
    return await response.text();
  } catch (error) {
    return `Failed to read response body: ${getErrorMessage(error)}`;
  }
}

export function buildHttpError(
  response: Response,
  body: string,
  context?: string,
): Error {
  const headers: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    headers[key] = value;
  });
  const prefix = context ? `${context}: ` : "";
  const error = new Error(
    `${prefix}HTTP ${response.status} ${response.statusText} ${body}`.trim(),
  );
  Object.assign(error, {
    status: response.status,
    statusText: response.statusText,
    url: response.url,
    body,
    headers,
  } satisfies HttpErrorDetails);
  return error;
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
        const body = await readResponseBody(response);
        throw buildHttpError(response, body, "fetchJsonWithRetry");
      }
      const body = await readResponseBody(response);
      try {
        return JSON.parse(body) as unknown;
      } catch (error) {
        throw new Error(
          `Failed to parse JSON response from ${url}: ${getErrorMessage(error)}. Body: ${body}`,
        );
      }
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
