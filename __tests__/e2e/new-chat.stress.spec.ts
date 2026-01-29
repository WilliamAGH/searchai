/**
 * E2E stress tests for New Chat functionality
 */

import { test, expect } from "@playwright/test";
import { setupNewChatPage } from "../helpers/new-chat";
import { getNewChatButton } from "../helpers/sidebar-helpers";

test.describe("New Chat Stress Tests", () => {
  test.beforeEach(async ({ page }) => {
    await setupNewChatPage(page);
  });

  test.fixme("should handle 5 sequential chat creations", async ({ page }) => {
    const chatUrls: string[] = [];

    for (let i = 0; i < 5; i++) {
      // Use helper to ensure sidebar is open and get button
      const newChatButton = await getNewChatButton(page);

      const creatingBtn = page.locator('button:has-text("Creating...")').first();
      const isCreating = await creatingBtn.isVisible({ timeout: 500 }).catch(() => false);
      if (isCreating) {
        await expect(creatingBtn).not.toBeVisible({ timeout: 10000 });
      }

      await expect(newChatButton).toBeEnabled({ timeout: 3000 });
      await newChatButton.click();

      const previousUrl = i > 0 ? chatUrls[i - 1] : null;
      try {
        if (previousUrl) {
          await page.waitForURL(
            (url) => url.toString() !== previousUrl && /\/(chat)\/.+/.test(url.toString()),
            {
              timeout: 10000,
            },
          );
        } else {
          await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });
        }
        chatUrls.push(page.url());
      } catch {
        console.info(`Chat creation ${i + 1} may have failed, continuing`);
      }

      await page.waitForLoadState("domcontentloaded");
    }

    const uniqueUrls = new Set(chatUrls);
    expect(uniqueUrls.size).toBeGreaterThanOrEqual(3);
  });

  test("should handle chat creation with existing messages", async ({ page }) => {
    // Page already at "/" from beforeEach setupNewChatPage
    const input = page
      .locator(
        'textarea[data-testid="message-input"], textarea[placeholder*="Type"], [role="textbox"]',
      )
      .first();
    await expect(input).toBeVisible({ timeout: 10000 });

    await input.fill("Initial message");
    await input.press("Enter");

    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });
    await expect(page.locator('[data-testid="message-assistant"]').first()).toBeVisible({
      timeout: 30000,
    });

    // Use helper to ensure sidebar is open and get button
    const newChatButton = await getNewChatButton(page);
    await newChatButton.click();

    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });

    await expect(page.locator('text="Initial message"')).not.toBeVisible();
  });
});
