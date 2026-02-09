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
    const responseFailures: string[] = [];

    // Monitor console errors
    page.on("console", (msg) => {
      if (msg.type() === "error") {
        const text = msg.text();
        // Ignore 403 errors from message sending - expected without API keys
        if (
          text.includes("HTTP 403") ||
          text.includes("Failed to send message") ||
          text.includes("403 (Forbidden)") ||
          text.includes("Failed to load resource") ||
          text.includes(
            'Viewport argument key "interactive-widget" not recognized',
          )
        ) {
          return;
        }
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

    // Monitor HTTP error responses
    page.on("response", (res) => {
      const url = res.url();
      if (!url.startsWith("http://") && !url.startsWith("https://")) return;
      const status = res.status();
      // Ignore 403 errors - these are expected from AI backend without API keys in tests
      if (status >= 400 && status !== 403) {
        responseFailures.push(`${res.request().method()} ${url} -> ${status}`);
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
    // The scroll container in ChatLayout uses overflow-y-auto + overscroll-contain
    const messageList = page
      .locator(".overflow-y-auto.overscroll-contain")
      .first();

    // Check visibility - count() is safe and won't throw
    const messageListCount = await messageList.count();
    const hasMessageList =
      messageListCount > 0 && (await messageList.isVisible());

    const emptyState = page.locator('text="No messages yet"').first();
    const emptyStateCount = await emptyState.count();
    const hasEmptyState = emptyStateCount > 0 && (await emptyState.isVisible());

    // Either message list or empty state should be visible - this is a required assertion
    expect(
      hasMessageList || hasEmptyState,
      "Either message list or empty state should be visible",
    ).toBeTruthy();

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
      // This is optional - new chats may not have enough messages to trigger pagination
      const loadMoreButton = page.locator('[data-testid="loadMore"]');
      const loadMoreCount = await loadMoreButton.count();

      if (loadMoreCount > 0 && (await loadMoreButton.isVisible())) {
        // If the button exists and is visible, it should be clickable
        // Use soft assertion - pagination is optional in smoke tests
        await expect
          .soft(loadMoreButton, "Load more button should be enabled")
          .toBeEnabled();
        await loadMoreButton.click();
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

    expect
      .soft(
        responseFailures,
        `No HTTP error responses during pagination test.\n${responseFailures.join("\n")}`,
      )
      .toEqual([]);

    // Final assertions - ensure no critical errors occurred
    expect(consoleErrors).toEqual([]);
    expect(requestFailures).toEqual([]);
    expect(responseFailures).toEqual([]);
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

    // Wait for "Creating..." state to clear first (backend operation in progress)
    // The button may not appear if creation is instant, so we check count first
    const creatingButton = page.locator('button:has-text("Creating")');
    const creatingCount = await creatingButton.count();
    if (creatingCount > 0) {
      await creatingButton.waitFor({ state: "hidden", timeout: 30000 });
    }

    // Wait for chat navigation - required for accessibility checks
    await page.waitForURL(/\/(chat|s|p)\//, { timeout: 30000 });

    // Check for ARIA attributes on pagination elements (element may not exist)
    // These are optional elements - only assert if they exist and are visible
    const loadMoreButton = page.locator('[data-testid="loadMore"]');
    const loadMoreCount = await loadMoreButton.count();
    if (loadMoreCount > 0 && (await loadMoreButton.isVisible())) {
      // If load more button exists and is visible, it must have proper accessibility
      const ariaLabel = await loadMoreButton.getAttribute("aria-label");
      expect(ariaLabel, "Load more button should have aria-label").toBeTruthy();

      const tagName = await loadMoreButton.evaluate((el) =>
        el.tagName.toLowerCase(),
      );
      expect(tagName, "Load more should be a semantic button").toBe("button");
    }

    // Check for scroll-to-bottom button accessibility (element may not exist)
    const scrollButton = page.locator('[aria-label*="scroll"]').first();
    const scrollCount = await scrollButton.count();
    if (scrollCount > 0 && (await scrollButton.isVisible())) {
      // If scroll button exists and is visible, it must have proper accessibility
      const ariaLabel = await scrollButton.getAttribute("aria-label");
      expect(ariaLabel, "Scroll button should have aria-label").toContain(
        "scroll",
      );
    }
  });
});
