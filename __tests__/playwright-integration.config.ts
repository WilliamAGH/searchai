import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";

// Ensure env vars are available (optional .env)
// Intentional: dotenv is optional - silently continue if not installed
try {
  await import("dotenv/config");
} catch {
  // dotenv not available - this is fine, env vars may be set via other means
}
import { desktopViewport } from "./config/viewports";

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

/**
 * Playwright configuration for integration tests
 * Runs against local development server with both frontend and backend
 */
export default defineConfig({
  testDir: "./integration",
  testIgnore: ["**/integration/pagination.test.ts"],
  timeout: 60_000, // Longer timeout for integration tests
  fullyParallel: false, // Run tests sequentially for consistency
  retries: 2, // Retry failed tests
  workers: 1, // Single worker for integration tests
  reporter: [
    ["list"],
    [
      "html",
      { outputFolder: "../playwright-report/integration", open: "never" },
    ],
    ["json", { outputFile: "../test-results/integration-results.json" }],
  ],
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on",
    screenshot: "on",
    video: "retain-on-failure",
    // Longer timeouts for integration tests
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"], viewport: desktopViewport },
    },
    {
      name: "firefox",
      use: { ...devices["Desktop Firefox"], viewport: desktopViewport },
    },
    {
      name: "webkit",
      use: { ...devices["Desktop Safari"], viewport: desktopViewport },
    },
  ],
  webServer: [
    {
      cwd: ROOT_DIR,
      // Run from repo root so vite preview serves dist/ correctly in CI.
      command: process.env.CI
        ? "bash -c 'npm run build && npx vite preview --strictPort --port 5173 --host 127.0.0.1'"
        : "npm run dev:frontend",
      url: "http://127.0.0.1:5173",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: "5173",
        // Use provided env or fall back to dev Convex cloud URL for tests
        VITE_CONVEX_URL:
          process.env.VITE_CONVEX_URL ||
          "https://diligent-greyhound-240.convex.cloud",
        CONVEX_SITE_URL:
          process.env.CONVEX_SITE_URL ||
          (process.env.VITE_CONVEX_URL
            ? process.env.VITE_CONVEX_URL.replace(
                ".convex.cloud",
                ".convex.site",
              )
            : "https://diligent-greyhound-240.convex.site"),
      },
    },
  ],
});
