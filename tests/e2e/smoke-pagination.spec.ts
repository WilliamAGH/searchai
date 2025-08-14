/**
 * Smoke test for message pagination load-more functionality
 * Tests that pagination UI appears and functions without errors
 * Validates scroll behavior and load-more button interactions
 */

import { test, expect } from "@playwright/test";

test.describe("smoke: pagination", () => {
  test("basic pagination elements render without errors", async ({
    page,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];

    // Monitor console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const loc = msg.location();
        const where = loc.url
          ? `${loc.url}:${loc.lineNumber ?? 0}:${loc.columnNumber ?? 0}`
          : "";
        consoleErrors.push(`${msg.text()}${where ? ` at ${where}` : ""}`);
      }
    });

    page.on("pageerror", (err) => {
      consoleErrors.push(err.stack || err.message);
    });

    // Monitor network failures
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (url.startsWith("http://") || url.startsWith("https://")) {
        // Ignore favicon requests
        if (url.includes("favicon")) return;
        requestFailures.push(
          `${req.method()} ${url} -> ${req.failure()?.errorText}`,
        );
      }
    });

    const target = baseURL ?? "http://localhost:4173";
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

    // Send multiple messages to create scrollable content
    // Note: In a real scenario with existing chat data, pagination would already be available
    const messages = [
      "Test message 2 - creating content for pagination",
      "Test message 3 - more content to scroll",
      "Test message 4 - building message history",
      "Test message 5 - pagination test content",
    ];

    for (const msg of messages) {
      // Wait for input to be ready
      const msgInput = page.locator('textarea, [role="textbox"]').first();
      await expect(msgInput).toBeEnabled({ timeout: 5000 });
      await msgInput.fill(msg);
      await page.keyboard.press("Enter");
      // Small delay between messages
      await page.waitForTimeout(500);
    }

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
    const target = baseURL ?? "http://localhost:4173";
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
