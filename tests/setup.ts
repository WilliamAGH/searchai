/**
 * Test setup for React 19 compatibility
 */

// Set up React act environment for testing
global.IS_REACT_ACT_ENVIRONMENT = true;

// Import React
import * as React from "react";

// Ensure global React is available for Testing Library
if (typeof globalThis !== "undefined" && !globalThis.React) {
  (globalThis as any).React = React;
}

// Import Testing Library utilities
import { expect } from "vitest";
// Best practice: use Testing Library's jest-dom matchers
// (toBeInTheDocument, toBeDisabled, etc.)
// This static import works after installing the package.
// It coexists with the minimal polyfills below.
// If your environment lacks network access, you can comment this out.
// eslint-disable-next-line import/no-unresolved, import/no-unassigned-import
import "@testing-library/jest-dom/vitest";
// (No-op: static import above loads matchers when installed.)

// React 19 doesn't export act directly - it's handled internally by React Testing Library v16+
// No need to mock react-dom/test-utils as Testing Library handles act automatically

// Custom matchers for tests
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
        pass
          ? "expected element to be enabled"
          : "expected element to be disabled",
    };
  },
} as any);
