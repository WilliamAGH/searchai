// tests/integration/chat-message-chaining.test.ts
import { test, expect } from "@playwright/test";

test.describe("Chat Message Chaining", () => {
  test("should handle message chaining correctly", async ({ page }) => {
    // Navigate to app
    await page.goto("/");

    // Send initial user message
    await page.fill('[data-testid="message-input"]', "Hello assistant");
    await page.press('[data-testid="message-input"]', "Enter");

    // Wait for user message to appear
    await page.waitForSelector('[data-testid="message-user"]');

    // Get chat ID from user message
    const firstMessage = await page
      .locator('[data-testid="message-user"]')
      .first();
    const chatIdBefore = await firstMessage.getAttribute("data-chat-id");
    expect(chatIdBefore).toBeTruthy();

    // Wait for assistant response
    await page.waitForSelector('[data-testid="message-assistant"]');

    // Send follow-up
    await page.fill('[data-testid="message-input"]', "Follow up");
    await page.press('[data-testid="message-input"]', "Enter");

    // Wait for second user message
    await page.waitForSelector('[data-testid="message-user"] >> nth=1');

    // Verify same chat ID on the new message
    const secondUserMessage = await page
      .locator('[data-testid="message-user"]')
      .nth(1);
    const chatIdAfter = await secondUserMessage.getAttribute("data-chat-id");

    expect(chatIdAfter).toBe(chatIdBefore);
  });

  test("should handle rapid user messages", async ({ page }) => {
    await page.goto("/");

    // Send multiple messages quickly
    const messages = ["First", "Second", "Third"];
    for (const msg of messages) {
      await page.fill('[data-testid="message-input"]', msg);
      await page.press('[data-testid="message-input"]', "Enter");
      // Wait for message to appear before sending next
      await page.waitForSelector(`text="${msg}"`, { timeout: 1000 });
    }

    // All messages should be in same chat
    await expect(async () => {
      const allMessages = await page.locator('[data-testid^="message-"]').all();
      // Ensure we have all 3 user messages plus potentially assistant messages
      // Firefox might be slower to render, so we check count first
      expect(allMessages.length).toBeGreaterThanOrEqual(3);

      const chatIds = await Promise.all(
        allMessages.map((msg) => msg.getAttribute("data-chat-id")),
      );

      // Filter out nulls/undefined that might happen during initial render
      const validChatIds = chatIds.filter(Boolean);
      expect(validChatIds.length).toBeGreaterThan(0);

      // Ensure we have chat IDs and they are consistent
      const uniqueChatIds = [...new Set(validChatIds)];
      // We want exactly 1 unique ID (no multiple IDs)
      expect(uniqueChatIds).toHaveLength(1);
    }).toPass({ timeout: 30000 });
  });

  test("should recover from network failure", async ({ page, browserName }) => {
    // Skip on Firefox and WebKit due to flaky context.setOffline() behavior
    // See: https://github.com/microsoft/playwright/issues/2311
    test.skip(
      browserName === "firefox" || browserName === "webkit",
      "Offline simulation is unreliable on Firefox and WebKit",
    );

    await page.goto("/");

    // Simulate offline
    await page.context().setOffline(true);

    // Try to send message
    await page.fill('[data-testid="message-input"]', "Offline message");
    await page.press('[data-testid="message-input"]', "Enter");

    // Should show error or retry
    // Use a more flexible check for offline state indication with longer timeout
    await expect(async () => {
      const errorVisible = await page
        .locator('[data-testid="error-message"]')
        .isVisible();
      const pendingVisible = await page
        .locator('[data-testid="message-pending"]')
        .isVisible();
      expect(errorVisible || pendingVisible).toBeTruthy();
    }).toPass({ timeout: 45000, interval: 1000 });

    // Go back online
    await page.context().setOffline(false);

    // Wait for online state recovery before retrying
    // Some browsers might need a moment to re-establish connection
    await page.waitForTimeout(1000);

    // Retry should work - verify button is clickable first
    const retryBtn = page.locator('[data-testid="retry-button"]');
    if (await retryBtn.isVisible()) {
      await retryBtn.click();
    } else {
      // If no retry button, try sending a new message to trigger reconnection
      await page.fill('[data-testid="message-input"]', "Back online message");
      await page.press('[data-testid="message-input"]', "Enter");
    }

    await expect(
      page.locator('[data-testid="message-user"]').last(),
    ).toBeVisible({
      timeout: 30000,
    });
  });
});
