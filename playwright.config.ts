import { defineConfig, devices } from "@playwright/test";
import { desktopViewport } from "./__tests__/config/viewports";

const useProxyRuntime = process.env.PLAYWRIGHT_RUNTIME === "proxy";

export default defineConfig({
  testDir: "./__tests__/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
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
  webServer: {
    command: useProxyRuntime
      ? "node scripts/server.mjs"
      : "bash -c 'npm run build && vite preview --strictPort --port 4173 --host 127.0.0.1'",
    url: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: "pipe",
    stderr: "pipe",
    env: useProxyRuntime
      ? {
          PORT: "4173",
          CONVEX_SITE_URL: process.env.CONVEX_SITE_URL || "",
        }
      : {
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
});
