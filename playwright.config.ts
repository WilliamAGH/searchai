import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5173",
    // Explicitly force headless mode - runs tests in background without browser windows
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: [
    {
      command: process.env.CI
        ? "npm run build && vite preview --strictPort --port 5173"
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
