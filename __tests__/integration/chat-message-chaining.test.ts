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

    // Send multiple messages with realistic timing
    const messages = ["First", "Second", "Third"];
    for (const msg of messages) {
      await page.fill('[data-testid="message-input"]', msg);
      await page.press('[data-testid="message-input"]', "Enter");
      // Wait for message to appear before sending next
      await expect(page.locator(`text="${msg}"`)).toBeVisible({
        timeout: 10000,
      });
    }

    // All messages should be in same chat
    await expect(async () => {
      const allMessages = await page.locator('[data-testid^="message-"]').all();
      expect(allMessages.length).toBeGreaterThanOrEqual(3);

      const chatIds = await Promise.all(
        allMessages.map((msg) => msg.getAttribute("data-chat-id")),
      );

      const validChatIds = chatIds.filter(Boolean);
      expect(validChatIds.length).toBeGreaterThan(0);

      const uniqueChatIds = [...new Set(validChatIds)];
      expect(uniqueChatIds).toHaveLength(1);
    }).toPass({ timeout: 30000 });
  });
});
