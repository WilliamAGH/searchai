import { defineConfig } from "@playwright/test";

const useProxyRuntime = process.env.PLAYWRIGHT_RUNTIME === "proxy";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    // Explicitly force headless mode - runs tests in background without browser windows
    headless: true,
    // Additional launch options to ensure browser stays in background
    launchOptions: {
      // Double-ensure headless mode at the browser launch level
      headless: true,
      // Prevent devtools from overriding headless setting
      devtools: false,
    },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: process.env.CI
        ? "vite preview --strictPort --port 5173"
        : "npm run dev:frontend",
      url: "http://localhost:5173",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
    },
  ],

  // Projects for different test types
  projects: [
    {
      name: "smoke",
      testMatch: /.*smoke.*\.spec\.ts/,
      workers: 2, // Reduce workers for smoke tests to avoid race conditions
    },
    {
      name: "default",
      testMatch: /.*\.spec\.ts/,
      workers: 8, // Default worker count for other tests
    },
  ],
});
