/**
 * Test setup for React 19 compatibility
 */

// Set up React act environment for testing
global.IS_REACT_ACT_ENVIRONMENT = true;

// Import React and setup act compatibility
import * as React from "react";

// React 19 has act in the main React export
// We need to ensure compatibility with React Testing Library
const act =
  React.act ||
  function (callback) {
    // Fallback for environments where React.act is not available
    const result = callback();
    if (result && typeof result.then === "function") {
      return result;
    }
    return Promise.resolve(result);
  };

// Ensure React.act exists for Testing Library compatibility
if (!React.act) {
  (React as any).act = act;
}

// Also ensure global React has act
if (typeof globalThis !== "undefined") {
  if (!globalThis.React) {
    (globalThis as any).React = React;
  }
  if (globalThis.React && !globalThis.React.act) {
    (globalThis.React as any).act = act;
  }
}

// Export act for use in tests
export { act };

// Mock react-dom/test-utils to provide act for backward compatibility
import { vi, expect, beforeAll } from "vitest";
// Try to dynamically load @testing-library/jest-dom matchers if available.
try {
  const spec = "@testing-library/jest" + "-dom/vitest";
  // eslint-disable-next-line @typescript-eslint/no-floating-promises
  import(spec).catch(() => {});
} catch {}

// Mock the react-dom/test-utils module
vi.mock("react-dom/test-utils", () => ({
  act: act,
  unstable_act: act,
}));

// Patch React Testing Library's act detection
beforeAll(() => {
  // React Testing Library looks for React.act
  // We can't modify the imported React directly, but we can ensure
  // the global has it for compatibility
  if (typeof globalThis !== "undefined" && globalThis.React) {
    if (!globalThis.React.act) {
      (globalThis.React as any).act = act;
    }
  }
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
