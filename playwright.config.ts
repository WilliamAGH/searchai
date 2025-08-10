import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173",
    headless: true,
    trace: "off",
  },
  webServer: {
    command: "npm run preview",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://localhost:4173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
