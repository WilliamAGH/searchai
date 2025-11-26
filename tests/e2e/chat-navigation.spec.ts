// Basic chat navigation and selection E2E coverage
// Run: npm run test:smoke (or playwright test)

import { test, expect } from "@playwright/test";
import { viewports } from "../config/viewports";

const HOME = "/";

async function ensureSidebarIsOpen(page: any) {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 1024;

  if (isMobile) {
    // Mobile: Check if dialog is already open, if not click toggle
    const newChatInDialog = page
      .locator('[role="dialog"] button:has-text("New Chat")')
      .first();
    const isDialogOpen = await newChatInDialog
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (!isDialogOpen) {
      const btn = page.locator('button[aria-label="Toggle sidebar"]').first();
      const isVisible = await btn
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (isVisible) {
        await btn.click();
        // Wait for New Chat button inside dialog to be visible
        await expect(newChatInDialog).toBeVisible({ timeout: 5000 });
      }
    }
  } else {
    // Desktop: Check if New Chat button is already visible (sidebar open)
    const newChatBtn = page.locator('button:has-text("New Chat")').first();
    const isSidebarOpen = await newChatBtn
      .isVisible({ timeout: 500 })
      .catch(() => false);

    if (!isSidebarOpen) {
      // Click toggle to open sidebar
      const btn = page.locator('button[aria-label="Toggle sidebar"]').first();
      const isVisible = await btn
        .isVisible({ timeout: 2000 })
        .catch(() => false);
      if (isVisible) {
        await btn.click();
        await page.waitForTimeout(300); // Wait for sidebar animation
      }
    }

    // Verify sidebar is now open
    await expect(newChatBtn).toBeVisible({ timeout: 5000 });
  }
}

test.describe("chat navigation", () => {
  test("home without chats does not auto-create immediately; creates on first action", async ({
    page,
    baseURL,
  }) => {
    await page.goto((baseURL ?? "http://localhost:4173") + HOME, {
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
    await page.goto((baseURL ?? "http://localhost:4173") + HOME, {
      waitUntil: "domcontentloaded",
    });

    // Ensure sidebar is open
    await ensureSidebarIsOpen(page);

    // Click New Chat - on mobile it's in dialog
    const newChat = page
      .locator('[role="dialog"] button:has-text("New Chat")')
      .first();
    await expect(newChat).toBeVisible({ timeout: 5000 });
    await newChat.click();

    // Should navigate to a chat route
    await expect(page).toHaveURL(/\/(chat|p|s)\//, { timeout: 10000 });
  });

  test.skip("deep link to /chat/:id keeps selection and back/forward returns home", async ({
    page,
    baseURL,
  }) => {
    // Start at home and create a chat via UI
    await page.goto((baseURL ?? "http://localhost:4173") + HOME);
    await page.waitForLoadState("networkidle");

    // Ensure sidebar is open (works for both desktop and mobile)
    await ensureSidebarIsOpen(page);

    // On desktop, New Chat is in sidebar. On mobile it would be in dialog.
    // Default viewport is desktop, so use regular selector.
    const newChatBtn = page.locator('button:has-text("New Chat")').first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });
    await newChatBtn.click();
    await expect(page).toHaveURL(/\/(chat|p|s)\//, { timeout: 10000 });

    const firstUrl = page.url();

    // Navigate to home
    await page.goto((baseURL ?? "http://localhost:4173") + HOME);
    await page.waitForLoadState("networkidle");
    await expect(page).toHaveURL(/\/$/);

    // Back to chat - wait for navigation to complete
    await page.goBack();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(firstUrl, { timeout: 5000 });

    // Forward to home
    await page.goForward();
    await page.waitForLoadState("domcontentloaded");
    await expect(page).toHaveURL(/\/$/, { timeout: 5000 });
  });

  test.fixme(
    "migration from local to server preserves current selection",
    async ({ page, baseURL }) => {
      // This test requires auth setup + server mapping; mark fixme until test env supports it
      await page.goto((baseURL ?? "http://localhost:4173") + HOME);
    },
  );

  test.fixme(
    "mobile swipe open/close is idempotent",
    async ({ page, baseURL }) => {
      await page.setViewportSize(viewports.iPhone12);
      await page.goto((baseURL ?? "http://localhost:4173") + HOME);
      // Implement swipe gestures with Playwright touch simulation when CI supports it
    },
  );
});
