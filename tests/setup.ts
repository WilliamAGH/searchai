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
import { vi } from "vitest";
vi.doMock("react-dom/test-utils", () => testUtils);
