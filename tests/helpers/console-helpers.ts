/**
 * Helper functions for handling console errors in Playwright tests
 */

import { Page } from "@playwright/test";

/**
 * Sets up console error collection with filtering for known non-issue errors
 * like Vite's WebSocket connections for HMR
 */
export function setupConsoleErrorCollection(page: Page) {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];

  // Monitor console errors with filtering
  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();

      // Filter out known non-issues
      if (isIgnorableError(text)) {
        return;
      }

      const loc = msg.location();
      const where = loc.url
        ? `${loc.url}:${loc.lineNumber ?? 0}:${loc.columnNumber ?? 0}`
        : "";
      consoleErrors.push(`${text}${where ? ` at ${where}` : ""}`);
    }
  });

  page.on("pageerror", (err) => {
    const errorText = err.stack || err.message;
    if (!isIgnorableError(errorText)) {
      consoleErrors.push(errorText);
    }
  });

  // Monitor network failures with filtering
  page.on("requestfailed", (req) => {
    const url = req.url();

    // Filter out known non-issues
    if (isIgnorableRequest(url)) {
      return;
    }

    if (url.startsWith("http://") || url.startsWith("https://")) {
      requestFailures.push(
        `${req.method()} ${url} -> ${req.failure()?.errorText}`,
      );
    }
  });

  return { consoleErrors, requestFailures };
}

/**
 * Checks if an error should be ignored
 */
function isIgnorableError(errorText: string): boolean {
  const ignorablePatterns = [
    // Vite WebSocket connections for HMR
    /WebSocket connection to 'ws:\/\/localhost:\d+\/' failed/,
    /WebSocket connection to 'wss?:\/\/.*' failed/,
    /ERR_CONNECTION_REFUSED.*@vite\/client/,

    // Vite HMR related
    /\[vite\]/,
    /@vite\/client/,

    // React development warnings that are ok in dev
    /React will try to recreate this component tree/,

    // Known third-party issues
    /ResizeObserver loop limit exceeded/,
    /ResizeObserver loop completed with undelivered notifications/,
  ];

  return ignorablePatterns.some((pattern) => pattern.test(errorText));
}

/**
 * Checks if a failed request should be ignored
 */
function isIgnorableRequest(url: string): boolean {
  const ignorablePatterns = [
    // Favicon requests
    /favicon/,

    // Vite HMR WebSocket
    /ws:\/\/localhost:\d+/,

    // Source maps
    /\.map$/,

    // Chrome extension requests
    /^chrome-extension:/,
  ];

  return ignorablePatterns.some((pattern) => pattern.test(url));
}

/**
 * Convenience wrapper that returns a cleanup function
 * Used for tests that need to clean up after themselves
 */
export function collectFilteredConsoleErrors(page: Page) {
  const { consoleErrors, requestFailures } = setupConsoleErrorCollection(page);

  return {
    consoleErrors,
    requestFailures,
    cleanup: () => {
      // Cleanup function for tests that need it
      // Currently no-op but can be extended if needed
    },
  };
}
