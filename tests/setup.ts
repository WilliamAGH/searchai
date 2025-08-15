/**
 * Test setup for React 19 compatibility
 */

// Set up React act environment for testing
global.IS_REACT_ACT_ENVIRONMENT = true;

// Import React and setup act compatibility
import * as React from "react";

// React 19 has act in the main React export
// We use it directly without trying to redefine it
const act = React.act;

// Ensure global React is available for Testing Library
if (typeof globalThis !== "undefined" && !globalThis.React) {
  (globalThis as any).React = React;
}

// Export act for use in tests
export { act };

// Mock react-dom/test-utils to provide act for backward compatibility
import { vi, expect } from "vitest";
// Best practice: use Testing Library's jest-dom matchers
// (toBeInTheDocument, toBeDisabled, etc.)
// This static import works after installing the package.
// It coexists with the minimal polyfills below.
// If your environment lacks network access, you can comment this out.
// eslint-disable-next-line import/no-unresolved
import "@testing-library/jest-dom/vitest";
// (No-op: static import above loads matchers when installed.)

// Mock the react-dom/test-utils module
vi.mock("react-dom/test-utils", () => ({
  act: act,
  unstable_act: act,
}));

// React Testing Library will automatically detect React.act in React 19
// No patching needed since act is already available

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
