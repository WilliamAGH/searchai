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

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    setupFiles: ["./tests/setup.ts"],
    environment: "node",
    silent: false, // Set to true to suppress console output during tests
    include: [
      "tests/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
      "convex/**/*.test.{ts,tsx}",
      "convex/**/__tests__/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      "tests/e2e/**",
      "tests/integration/**",
      "tests/**/*.spec.ts",
      "tests/smoke/**",
      "convex/_generated/**",
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
          include: [
            "tests/**/*.test.tsx",
            "src/**/__tests__/**/*.test.tsx",
            "tests/critical/**",
          ],
          exclude: ["node_modules/**", "dist/**"],
        },
      },
      {
        // inherit plugins and resolve.alias from root config
        extends: true,
        test: {
          name: "node",
          environment: "node",
          include: [
            "tests/**/*.test.ts",
            "src/**/__tests__/**/*.test.ts",
            "convex/**/*.test.ts",
          ],
          exclude: [
            "node_modules/**",
            "dist/**",
            "**/*.test.tsx",
            "tests/critical/**",
            "tests/e2e/**",
            "tests/integration/**",
            "tests/**/*.spec.ts",
            "tests/smoke/**",
          ],
        },
      },
    ],
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}", "convex/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "convex/_generated/**",
        "convex/**/*.test.{ts,tsx}",
        "convex/**/__tests__/**",
      ],
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
