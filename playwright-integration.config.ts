import { defineConfig, devices } from "@playwright/test";

// Ensure env vars are available (optional .env)
try {
  await import("dotenv/config");
} catch {}
import { desktopViewport } from "./tests/config/viewports";

/**
 * Playwright configuration for integration tests
 * Runs against local development server with both frontend and backend
 */
export default defineConfig({
  testDir: "./tests/integration",
  testIgnore: ["**/tests/integration/pagination.test.ts"],
  timeout: 60_000, // Longer timeout for integration tests
  fullyParallel: false, // Run tests sequentially for consistency
  retries: 2, // Retry failed tests
  workers: 1, // Single worker for integration tests
  reporter: [
    ["list"],
    ["html", { outputFolder: "playwright-report/integration", open: "never" }],
    ["json", { outputFile: "test-results/integration-results.json" }],
  ],
  use: {
    baseURL: "http://localhost:5173",
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
      command: "node server.mjs",
      url: "http://localhost:5173",
      timeout: 180_000,
      reuseExistingServer: true,
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
