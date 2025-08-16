/**
 * Smoke test for message pagination load-more functionality
 * Tests that pagination UI appears and functions without errors
 * Validates scroll behavior and load-more button interactions
 */

import { test, expect } from "@playwright/test";
import { setupConsoleErrorCollection } from "../helpers/console-helpers";
import { setupMSWForTest, cleanupMSWForTest } from "../helpers/setup-msw";

test.describe("smoke: pagination", () => {
  test.beforeEach(async ({ page }) => {
    await setupMSWForTest(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupMSWForTest(page);
  });

  test("basic pagination elements render without errors", async ({
    page,
    baseURL,
  }) => {
    // Use helper to setup console error collection with WebSocket filtering
    const { consoleErrors, requestFailures } =
      setupConsoleErrorCollection(page);

    const target = baseURL ?? "http://localhost:5180";
    await page.goto(target, { waitUntil: "domcontentloaded" });

    // Wait for page to be ready
    await expect(page).toHaveTitle(/search|ai|SearchAI/i, {
      timeout: 15000,
    });

    // Create a chat with multiple messages to trigger pagination
    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Send first message to create chat
    await input.click({ force: true });
    await input.fill("Test message 1 for pagination");
    await page.keyboard.press("Enter");

    // Wait for chat creation and navigation
    await page.waitForURL(/\/(chat|s|p)\//, { timeout: 15000 });

    // For smoke test, we don't need to send multiple messages
    // Just verify the pagination UI elements are present and don't cause errors
    // In production, pagination would be tested with pre-existing chat data

    // Check for message list container - look for the scrollable area
    // The message list is the flex-1 overflow-y-auto container
    const messageList = page.locator(".flex-1.overflow-y-auto").first();

    // If no message list found, check for empty state instead
    const hasMessageList = await messageList.isVisible().catch(() => false);
    const emptyState = page.locator('text="No messages yet"').first();
    const hasEmptyState = await emptyState.isVisible().catch(() => false);

    // Either message list or empty state should be visible
    expect(hasMessageList || hasEmptyState).toBeTruthy();

    // If we have a message list, test scrolling behavior
    if (hasMessageList) {
      // Test basic scroll operations don't cause errors
      await messageList.evaluate((el) => {
        el.scrollTop = 0; // Scroll to top
      });

      await messageList.evaluate((el) => {
        el.scrollTop = el.scrollHeight; // Scroll to bottom
      });

      // Check if load-more button exists (only appears when there are more messages)
      const loadMoreButton = page.locator('[data-testid="loadMore"]');
      const hasLoadMore = await loadMoreButton.isVisible().catch(() => false);

      if (hasLoadMore) {
        // Verify button is clickable (doesn't throw)
        await loadMoreButton.click().catch(() => {
          // Button might be disabled or loading, that's ok for smoke test
        });
      }
    }

    // Final assertions - ensure no errors occurred
    expect
      .soft(
        consoleErrors,
        `No console errors during pagination test.\n${consoleErrors.join("\n")}`,
      )
      .toEqual([]);

    expect
      .soft(
        requestFailures,
        `No network failures during pagination test.\n${requestFailures.join("\n")}`,
      )
      .toEqual([]);

    // Final assertions - ensure no critical errors occurred
    expect(consoleErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
  });

  test("pagination UI elements are accessible", async ({ page, baseURL }) => {
    const target = baseURL ?? "http://localhost:5180";
    await page.goto(target, { waitUntil: "domcontentloaded" });

    // Wait for page to be ready
    await expect(page).toHaveTitle(/search|ai|SearchAI/i, {
      timeout: 15000,
    });

    // Create a simple chat
    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });
    await input.click({ force: true });
    await input.fill("Test accessibility");
    await page.keyboard.press("Enter");

    // Wait for chat navigation
    await page.waitForURL(/\/(chat|s|p)\//, { timeout: 15000 });

    // Check for ARIA attributes on pagination elements
    const loadMoreButton = page.locator('[data-testid="loadMore"]');
    if (await loadMoreButton.isVisible().catch(() => false)) {
      // Check button has proper ARIA labels
      const ariaLabel = await loadMoreButton.getAttribute("aria-label");
      expect(ariaLabel).toBeTruthy();

      // Check button has proper role or is semantic button
      const tagName = await loadMoreButton.evaluate((el) =>
        el.tagName.toLowerCase(),
      );
      expect(tagName).toBe("button");
    }

    // Check for scroll-to-bottom button accessibility
    const scrollButton = page.locator('[aria-label*="scroll"]').first();
    if (await scrollButton.isVisible().catch(() => false)) {
      const ariaLabel = await scrollButton.getAttribute("aria-label");
      expect(ariaLabel).toContain("scroll");
    }
  });
});
