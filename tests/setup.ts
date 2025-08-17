/**
 * Test setup for React 19 compatibility
 * Enhanced for VS Code environment compatibility
 */

// Set up React act environment for testing (critical for VS Code)
global.IS_REACT_ACT_ENVIRONMENT = true;

// Import React and expect from vitest
import * as React from "react";
import { expect, vi } from "vitest";

// Ensure NODE_ENV is set for consistent test behavior
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

// Ensure global React is available for Testing Library
if (typeof globalThis !== "undefined" && !globalThis.React) {
  (globalThis as any).React = React;
}

// Best practice: use Testing Library's jest-dom matchers
// (toBeInTheDocument, toBeDisabled, etc.)
// This static import works after installing the package.
// It coexists with the minimal polyfills below.
// If your environment lacks network access, you can comment this out.
// eslint-disable-next-line import/no-unresolved
// oxlint-disable-next-line no-unassigned-import
import "@testing-library/jest-dom/vitest";

// React 19 + Testing Library v16+ handles act automatically, but ensure
// react-dom/test-utils.act is mapped correctly across environments.
vi.mock("react-dom/test-utils", async () => {
  const actual = await vi.importActual<any>("react-dom/test-utils");
  // Prefer React.act when available, otherwise fall back to the actual module's act,
  // and as a last resort provide a minimal async wrapper to avoid crashes.
  const reactAct = (React as any).act;
  const fallbackAct = (actual as any)?.act;
  const safeAct = reactAct || fallbackAct || (async (cb: any) => await cb());
  return {
    ...actual,
    act: safeAct,
    unstable_act: safeAct,
  };
});

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
