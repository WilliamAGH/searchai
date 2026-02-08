/**
 * Vitest configuration
 *
 * CI Strategy:
 * - Use `vmForks` with a single worker in CI to avoid known
 *   tinypool recursion/stack issues in constrained environments.
 * - Local runs remain fast and parallel by default.
 */
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import path from "node:path";

const EXPECTED_TEST_LOG_PREFIXES = [
  "[BLOCKED] Rejected request from unauthorized origin:",
  "[CORS] Malformed origin rejected during wildcard check",
  "[http] Excluded source with invalid URL",
  "[agents] Excluded source with invalid URL",
  "[messages] Excluded source with invalid URL",
  "[url] normalizeUrlForKey: rejected invalid URL",
  "[CONTENT] SCRAPED_CONTENT_SUMMARY:",
  "Chat validation: missing ID but found in messages",
  "Chat validation: ID mismatch",
  "Using paginated messages - preferred source",
  "Using unified messages while paginated source is loading",
  "Using unified messages - optimistic state present",
];

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    setupFiles: ["./__tests__/setup.ts"],
    environment: "node",
    silent: false, // Set to true to suppress console output during tests
    // Suppress expected negative-path diagnostics to keep test output readable.
    onConsoleLog(log) {
      return !EXPECTED_TEST_LOG_PREFIXES.some((prefix) => log.includes(prefix));
    },
    // Top-level __tests__/ with mirrored structure: __tests__/src/* and __tests__/convex/*
    include: [
      "__tests__/src/**/*.test.{ts,tsx}",
      "__tests__/convex/**/*.test.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      "__tests__/e2e/**",
      "__tests__/integration/**",
    ],
    reporters: process.env.CI ? ["default", "json", "html"] : ["default"],
    ...(process.env.CI && {
      pool: "vmForks" as const,
      minThreads: 1,
      maxThreads: 1,
    }),
    projects: [
      {
        // inherit plugins and resolve.alias from root config
        extends: true,
        test: {
          name: "jsdom",
          environment: "jsdom",
          // React component tests need jsdom
          include: ["__tests__/src/**/*.test.tsx"],
          exclude: ["node_modules/**", "dist/**"],
        },
      },
      {
        // inherit plugins and resolve.alias from root config
        extends: true,
        test: {
          name: "node",
          environment: "node",
          // Backend and pure logic tests use node
          include: [
            "__tests__/src/**/*.test.ts",
            "__tests__/convex/**/*.test.ts",
          ],
          exclude: [
            "node_modules/**",
            "dist/**",
            "**/*.test.tsx",
            "__tests__/e2e/**",
            "__tests__/integration/**",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text-summary", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}", "convex/**/*.{ts,tsx}"],
      exclude: ["src/**/*.d.ts", "src/main.tsx", "convex/_generated/**"],
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
      enabled: true,
    },
  },
});
