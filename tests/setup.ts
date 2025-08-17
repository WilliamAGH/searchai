/**
 * Test setup for React 19 compatibility
 * Enhanced for VS Code environment compatibility
 */

// Set up React act environment for testing (critical for VS Code)
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

// Import React and expect from vitest
import * as React from "react";
import { vi } from "vitest";

// Ensure NODE_ENV is set for consistent test behavior
if (!process.env.NODE_ENV) {
  process.env.NODE_ENV = "test";
}

// Minimal one-time debug to trace React environment under hooks
// eslint-disable-next-line no-console
console.log(
  `[TestSetup] React ${React.version}; act=${typeof (React as any).act}`,
);

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

// Note: Custom matchers are provided by @testing-library/jest-dom/vitest
// No need to duplicate them here as they're imported above
