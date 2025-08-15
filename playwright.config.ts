import { defineConfig } from "@playwright/test";

const useProxyRuntime = process.env.PLAYWRIGHT_RUNTIME === "proxy";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5180",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: useProxyRuntime
      ? "node server.mjs"
      : "bash -c 'npm run dev:frontend'",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:5180",
    reuseExistingServer: true,
    timeout: 60_000,
    env: useProxyRuntime
      ? {
          PORT: "5180",
          CONVEX_SITE_URL: process.env.CONVEX_SITE_URL || "",
        }
      : undefined,
  },
});
