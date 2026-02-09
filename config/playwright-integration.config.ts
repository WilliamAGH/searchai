import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig, devices } from "@playwright/test";
import { includeWebkit } from "./playwright.browsers";
import { desktopViewport } from "./playwright.viewports";

// Ensure env vars are available (optional .env).
try {
  await import("dotenv/config");
} catch {
  // dotenv not available; env vars may already be provided by CI/runtime.
}

const ROOT_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

export default defineConfig({
  testDir: "../__tests__/integration",
  testIgnore: ["**/integration/pagination.test.ts"],
  timeout: 60_000,
  fullyParallel: false,
  retries: 2,
  workers: 1,
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
    ...(includeWebkit
      ? [
          {
            name: "webkit",
            use: { ...devices["Desktop Safari"], viewport: desktopViewport },
          },
        ]
      : []),
  ],
  webServer: [
    {
      cwd: ROOT_DIR,
      command: process.env.CI
        ? "npx vite preview --strictPort --port 5173 --host 127.0.0.1"
        : "npm run dev:frontend",
      url: "http://127.0.0.1:5173",
      timeout: 180_000,
      reuseExistingServer: !process.env.CI,
      stdout: "pipe",
      stderr: "pipe",
      env: {
        PORT: "5173",
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
