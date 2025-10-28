import { defineConfig } from "@playwright/test";

const useProxyRuntime = process.env.PLAYWRIGHT_RUNTIME === "proxy";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  retries: 0,
  reporter: "list",
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || "http://127.0.0.1:4173",
    headless: true,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  webServer: {
    command: useProxyRuntime
      ? "node server.mjs"
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
