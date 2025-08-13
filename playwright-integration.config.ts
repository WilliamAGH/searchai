import { defineConfig, devices } from "@playwright/test";

/**
 * Playwright configuration for integration tests
 * Runs against local development server with both frontend and backend
 */
export default defineConfig({
  testDir: "./tests/integration",
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
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "firefox",
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "webkit",
      use: {
        ...devices["Desktop Safari"],
        viewport: { width: 1280, height: 720 },
      },
    },
    {
      name: "mobile",
      use: {
        ...devices["iPhone 13"],
      },
    },
  ],
  webServer: [
    {
      command: process.env.CI
        ? "vite preview --strictPort --port 5173"
        : "npm run dev:frontend",
      port: 5173,
      timeout: 120_000,
      reuseExistingServer: true,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],
});
