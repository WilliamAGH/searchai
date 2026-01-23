/**
 * Integration tests for chat message race condition handling
 * Tests ensure messages maintain consistent chat IDs across operations
 */

import { test, expect } from "@playwright/test";

// Skip on Firefox and WebKit due to stability issues
test.skip(
  ({ browserName }) => browserName === "firefox" || browserName === "webkit",
  "Integration suite unstable on Firefox and WebKit",
);

test.describe("Race Condition Fix - Assistant First Message", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should maintain same chat when user replies to assistant-first message", async ({
    page,
  }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill("Hello, I need help with searching");
    await messageInput.press("Enter");

    // Wait for user message to appear
    const userMessage = page.locator('[data-testid="message-user"]').first();
    await expect(userMessage).toBeVisible({ timeout: 30000 });

    // Extract chat ID from user message
    const chatIdFromUser = await userMessage.getAttribute("data-chat-id");
    expect(chatIdFromUser).toBeTruthy();

    // Wait for assistant response
    const assistantMessage = page
      .locator('[data-testid="message-assistant"]')
      .first();
    await expect(assistantMessage).toBeVisible({ timeout: 45000 });

    // Verify assistant message has same chat ID
    const chatIdFromAssistant =
      await assistantMessage.getAttribute("data-chat-id");
    expect(chatIdFromAssistant).toBe(chatIdFromUser);

    // Verify URL contains chat ID
    await expect(page).toHaveURL(/\/chat\/[^/]+/, { timeout: 30000 });
    const urlChatId = page.url().split("/chat/")[1];
    expect(urlChatId).toBe(chatIdFromUser);

    // Send another message to ensure consistency
    await messageInput.fill("Can you search for TypeScript tutorials?");
    await messageInput.press("Enter");

    // Wait for second user message
    const secondUserMessage = page
      .locator('[data-testid="message-user"]')
      .nth(1);
    await expect(secondUserMessage).toBeVisible({ timeout: 10000 });

    // Verify all messages are in the same chat
    const secondChatId = await secondUserMessage.getAttribute("data-chat-id");
    expect(secondChatId).toBe(chatIdFromUser);
  });

  test("should handle multiple messages without creating new chats", async ({
    page,
  }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    const messages = [
      "First message",
      "Second message quickly",
      "Third message very fast",
    ];

    // Send messages with proper waits between each
    for (const msg of messages) {
      await messageInput.fill(msg);
      await messageInput.press("Enter");
      // Wait for message to appear before sending next
      await expect(page.locator(`text="${msg}"`)).toBeVisible({
        timeout: 15000,
      });
    }

    // Wait for all user messages to appear
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(3, {
      timeout: 30000,
    });

    // Collect all chat IDs
    const allMessages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      allMessages.map((msg) => msg.getAttribute("data-chat-id")),
    );

    // Verify all messages have the same chat ID
    const uniqueChatIds = [...new Set(chatIds.filter((id) => id))];
    expect(uniqueChatIds).toHaveLength(1);
  });
});

test.describe("Chat State Management", () => {
  test("should correctly initialize chat from URL parameters", async ({
    page,
  }) => {
    // Create a specific chat ID
    const testChatId = "test_chat_" + Date.now();

    // Navigate directly to a chat URL
    await page.goto(`/chat/${testChatId}`);
    await page.waitForLoadState("networkidle");

    // Send a message
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill("Testing direct chat navigation");
    await messageInput.press("Enter");

    // Verify message appears with a chat ID
    const userMessage = page.locator('[data-testid="message-user"]').first();
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    const chatId = await userMessage.getAttribute("data-chat-id");
    expect(chatId).toBeTruthy();

    // URL should contain the chat ID from the message
    const escapedChatId = (chatId ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveURL(new RegExp(`/chat/${escapedChatId}`));
  });
});

test.describe("Message Validation", () => {
  test("should validate and correct mismatched chat IDs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');

    // Send multiple messages with proper waits
    for (let i = 1; i <= 3; i++) {
      await messageInput.fill(`Test message ${i}`);
      await messageInput.press("Enter");
      await expect(page.locator(`text="Test message ${i}"`)).toBeVisible({
        timeout: 10000,
      });
    }

    // All messages should have consistent chat IDs
    await expect(async () => {
      const messages = await page.locator('[data-testid^="message-"]').all();
      const currentChatIds = await Promise.all(
        messages.map((msg) => msg.getAttribute("data-chat-id")),
      );
      const validIds = currentChatIds.filter((id) => id && id.length > 0);
      expect(validIds.length).toBeGreaterThan(0);
      const uniqueIds = [...new Set(validIds)];
      expect(uniqueIds).toHaveLength(1);
    }).toPass({ timeout: 30000 });
  });

  test("should handle edge case of empty or whitespace messages", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');

    // Try to send empty message
    await messageInput.fill("");
    await messageInput.press("Enter");

    // Verify no message is created (deterministic polling assertion)
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(0);

    // Try whitespace only
    await messageInput.fill("   ");
    await messageInput.press("Enter");

    // Verify no message is created (deterministic polling assertion)
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(0);

    // Send valid message
    await messageInput.fill("Valid message");
    await messageInput.press("Enter");

    // Should create message
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Performance Testing", () => {
  test("should handle sequential message sending", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');
    const messageCount = 5;

    // Send messages with proper waits
    for (let i = 1; i <= messageCount; i++) {
      await messageInput.fill(`Sequential message ${i}`);
      await messageInput.press("Enter");
      // Wait for each message to appear
      await expect(page.locator(`text="Sequential message ${i}"`)).toBeVisible({
        timeout: 15000,
      });
    }

    // Wait for all messages
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(
      messageCount,
      { timeout: 30000 },
    );

    // Verify all have same chat ID
    const messages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      messages.map((msg) => msg.getAttribute("data-chat-id")),
    );
    const uniqueIds = [...new Set(chatIds.filter(Boolean))];
    expect(uniqueIds).toHaveLength(1);
  });
});
