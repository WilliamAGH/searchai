/**
 * Test setup for React 19 compatibility
 */

// Set up React act environment for testing
global.IS_REACT_ACT_ENVIRONMENT = true;

// React 19 moved act from react-dom/test-utils to react package
// This setup ensures compatibility for both import styles

// Export act from React package for modern imports
export { act } from "react";

// Also make act available from react-dom/test-utils for legacy compatibility
import { act } from "react";
import * as React from "react";

// Ensure React.act exists for any code that expects it
if (!React.act) {
  (React as any).act = act;
}

// Mock react-dom/test-utils to provide act for backward compatibility
const testUtils = { act };

// Use vi.mock to override react-dom/test-utils
import { vi, expect } from "vitest";
vi.doMock("react-dom/test-utils", () => testUtils);

// Try to install Testing Library jest-dom matchers for Vitest.
// If the package is unavailable in this sandbox, fall back to minimal matchers
// to satisfy common expectations in unit tests.
// Minimal polyfills for matchers used in our tests
expect.extend({
  toBeInTheDocument(received: unknown) {
    const pass =
      !!received &&
      received instanceof Node &&
      (received.ownerDocument?.contains(received) ||
        (globalThis.document?.body?.contains?.(received as Node) ?? false));
    return {
      pass,
      message: () =>
        pass
          ? "expected element not to be in the document"
          : "expected element to be in the document",
    };
  },
  toBeDisabled(received: unknown) {
    const el = received as any;
    const pass =
      !!el &&
      (el.hasAttribute?.("disabled") ||
        el.disabled === true ||
        el.getAttribute?.("aria-disabled") === "true");
    return {
      pass,
      message: () =>
        pass ? "expected element to be enabled" : "expected element to be disabled",
    };
  },
} as any);
