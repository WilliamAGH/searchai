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
    reporters: ["default"],
    coverage: {
      provider: "v8",
      enabled: false,
    },
  },
});
