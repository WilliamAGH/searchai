// tests/integration/chat-message-chaining.test.ts
import { test, expect } from "@playwright/test";

test.describe("Chat Message Chaining", () => {
  test("should handle assistant-first message correctly", async ({ page }) => {
    // Navigate to app
    await page.goto("/");

    // Wait for assistant welcome message
    await page.waitForSelector('[data-testid="message-assistant"]');

    // Get chat ID from first message
    const firstMessage = await page
      .locator('[data-testid="message-assistant"]')
      .first();
    const chatIdBefore = await firstMessage.getAttribute("data-chat-id");

    // Send user reply
    await page.fill('[data-testid="message-input"]', "Hello assistant");
    await page.press('[data-testid="message-input"]', "Enter");

    // Wait for user message to appear
    await page.waitForSelector('[data-testid="message-user"]');

    // Verify same chat ID
    const userMessage = await page
      .locator('[data-testid="message-user"]')
      .first();
    const chatIdAfter = await userMessage.getAttribute("data-chat-id");

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
    const allMessages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      allMessages.map((msg) => msg.getAttribute("data-chat-id")),
    );

    // All should have same chat ID
    const uniqueChatIds = [...new Set(chatIds)];
    expect(uniqueChatIds).toHaveLength(1);
  });

  test("should recover from network failure", async ({ page }) => {
    await page.goto("/");

    // Simulate offline
    await page.context().setOffline(true);

    // Try to send message
    await page.fill('[data-testid="message-input"]', "Offline message");
    await page.press('[data-testid="message-input"]', "Enter");

    // Should show error or retry
    await expect(page.locator('[data-testid="error-message"]')).toBeVisible();

    // Go back online
    await page.context().setOffline(false);

    // Retry should work
    await page.click('[data-testid="retry-button"]');
    await expect(page.locator('[data-testid="message-user"]')).toBeVisible();
  });
});
