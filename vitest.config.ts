import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "node",
    include: [
      "tests/**/*.test.{ts,tsx}",
      "src/**/__tests__/**/*.{test,spec}.{ts,tsx}",
    ],
    exclude: [
      "node_modules",
      "dist",
      "tests/e2e/**",
      "tests/integration/**",
      "tests/**/*.spec.ts",
    ],
    reporter: process.env.CI ? ["default", "json", "html"] : ["default"],
    ...(process.env.CI && {
      pool: "forks" as const,
      minThreads: 1,
      maxThreads: 1,
    }),
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "src/**/*.test.{ts,tsx}",
        "src/**/__tests__/**",
        "src/**/*.d.ts",
        "src/main.tsx",
        "convex/_generated/**",
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
