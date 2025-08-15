import { defineConfig } from "@playwright/test";

const useProxyRuntime = process.env.PLAYWRIGHT_RUNTIME === "proxy";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:5180",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  // Don't start a web server since we're using the existing dev server
  webServer: undefined,
});
