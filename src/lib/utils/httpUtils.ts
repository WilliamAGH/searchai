// Minimal HTTP utilities for frontend operations
// These do NOT duplicate Convex functionality - they're for non-Convex HTTP operations

import { getErrorMessage } from "../../../convex/lib/errors";

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
        const parsed: unknown = JSON.parse(body);
        return parsed;
      } catch (error) {
        throw new Error(
          `Failed to parse JSON response from ${url}: ${getErrorMessage(error)}. Body: ${body}`,
        );
      }
    } catch (error) {
      lastError =
        error instanceof Error
          ? error
          : new Error(getErrorMessage(error, "Unknown HTTP error"));
      if (i < maxRetries - 1) {
        await new Promise((resolve) =>
          setTimeout(resolve, 1000 * Math.pow(2, i)),
        );
      }
    }
  }

  throw lastError ?? new Error("Unknown HTTP error");
}
