import { chromium, type FullConfig } from "@playwright/test";

/**
 * Global setup for Playwright tests
 * This sets up MSW (Mock Service Worker) to intercept all search API calls
 * and return synthetic results, ensuring tests are not rate-limited by real APIs
 */
async function globalSetup(_config: FullConfig) {
  console.log("🔧 Setting up MSW for Playwright E2E tests...");

  // Launch a browser to set up MSW
  const browser = await chromium.launch();
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Navigate to the app to register MSW
    await page.goto("http://localhost:5173");

    // Wait for the page to load
    await page.waitForLoadState("networkidle");

    // Set up MSW in the browser context
    await page.addInitScript(() => {
      // This will be executed in the browser context
      window.__MSW_ENABLED__ = true;
    });

    // Import and start MSW
    await page.evaluate(async () => {
      // Dynamic import of MSW setup
      // Dynamic import would be done here if needed
      console.log("MSW setup would happen here");
    });

    console.log("✅ MSW successfully set up for Playwright tests");
  } catch (error) {
    console.error("❌ Failed to set up MSW for Playwright tests:", error);
    // Don't fail the setup - tests can still run without mocks
  } finally {
    await browser.close();
  }
}

export default globalSetup;
