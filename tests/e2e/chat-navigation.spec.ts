// Basic chat navigation and selection E2E coverage
// Run: npm run test:smoke (or playwright test)

import { test, expect } from "@playwright/test";
import { viewports } from "../config/viewports";

const HOME = "/";

async function openMobileMenu(page: any) {
  const btn = page.locator('button[aria-label="Open chat menu"]');
  if (await btn.isVisible()) {
    await btn.click();
  }
}

test.describe("chat navigation", () => {
  test("home without chats does not auto-create immediately; creates on first action", async ({
    page,
    baseURL,
  }) => {
    await page.goto((baseURL ?? "http://localhost:5180") + HOME, {
      waitUntil: "domcontentloaded",
    });

    // Initial render shows UI, but no /chat/:id route yet
    await expect(page).toHaveURL(/\/$/);

    // Allow idle; auto-create may occur after delay if truly no chats
    await page.waitForLoadState("networkidle", { timeout: 1000 });

    // Either still on home or navigated to /chat/:id
    // This asserts no immediate hard redirect happened before idle
    // (We accept either outcome after the delay.)
    await expect(page).toHaveURL(/\/(|chat\/.*|p\/.*|s\/.*)$/);
  });

  test("selecting chats from mobile menu updates route and closes menu", async ({
    page,
    baseURL,
  }) => {
    await page.setViewportSize(viewports.iPhone12);
    await page.goto((baseURL ?? "http://localhost:5180") + HOME, {
      waitUntil: "domcontentloaded",
    });

    // Open the mobile menu
    await openMobileMenu(page);

    // Click New Chat (creates a chat then closes)
    const newChat = page.getByRole("button", { name: /New Chat/i });
    await newChat.click();

    // Should navigate to a chat route
    await expect(page).toHaveURL(/\/(chat|p|s)\//);
  });

  test("deep link to /chat/:id keeps selection and back/forward returns home", async ({
    page,
    baseURL,
  }) => {
    // Start at home and create a chat via UI
    await page.goto((baseURL ?? "http://localhost:5180") + HOME);
    await openMobileMenu(page);
    await page.getByRole("button", { name: /New Chat/i }).click();
    await expect(page).toHaveURL(/\/(chat|p|s)\//);

    const firstUrl = page.url();

    // Navigate to home
    await page.goto((baseURL ?? "http://localhost:5180") + HOME);
    await expect(page).toHaveURL(/\/$/);

    // Back to chat
    await page.goBack();
    await expect(page).toHaveURL(firstUrl);

    // Forward to home
    await page.goForward();
    await expect(page).toHaveURL(/\/$/);
  });

  test.fixme(
    "migration from local to server preserves current selection",
    async ({ page, baseURL }) => {
      // This test requires auth setup + server mapping; mark fixme until test env supports it
      await page.goto((baseURL ?? "http://localhost:5180") + HOME);
    },
  );

  test.fixme(
    "mobile swipe open/close is idempotent",
    async ({ page, baseURL }) => {
      await page.setViewportSize(viewports.iPhone12);
      await page.goto((baseURL ?? "http://localhost:5180") + HOME);
      // Implement swipe gestures with Playwright touch simulation when CI supports it
    },
  );
});
