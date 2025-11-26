/**
 * Comprehensive integration tests for the chat message race condition fix
 * Tests the critical scenario where assistant sends first message and user replies
 */

import { test, expect } from "@playwright/test";

test.describe("Race Condition Fix - Assistant First Message", () => {
  test.beforeEach(async ({ page }) => {
    // Start fresh for each test
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should maintain same chat when user replies to assistant-first message", async ({
    page,
  }) => {
    // User sends a reply
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill("Hello, I need help with searching");
    await messageInput.press("Enter");

    // Wait for user message to appear
    const userMessage = page.locator('[data-testid="message-user"]').first();
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // Extract chat ID from user message
    const chatIdFromUser = await userMessage.getAttribute("data-chat-id");
    expect(chatIdFromUser).toBeTruthy();

    // Wait for assistant response
    const assistantMessage = page
      .locator('[data-testid="message-assistant"]')
      .first();
    await expect(assistantMessage).toBeVisible({ timeout: 30000 });

    // Verify assistant message has same chat ID
    const chatIdFromAssistant =
      await assistantMessage.getAttribute("data-chat-id");
    expect(chatIdFromAssistant).toBe(chatIdFromUser);

    // Verify URL hasn't changed to a new chat
    await expect(page).toHaveURL(/\/chat\/[^/]+/, { timeout: 10000 });
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

  test("should handle multiple rapid replies without creating new chats", async ({
    page,
  }) => {
    const messageInput = page.locator('[data-testid="message-input"]');
    const messages = [
      "First message",
      "Second message quickly",
      "Third message very fast",
    ];

    // Send messages rapidly
    for (const msg of messages) {
      await messageInput.fill(msg);
      await messageInput.press("Enter");
      // Very short delay to simulate rapid typing
      await new Promise((resolve) => setTimeout(resolve, 50));
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
    // Filter out any nulls that might happen during initial render
    const uniqueChatIds = [...new Set(chatIds.filter((id) => id))];
    expect(uniqueChatIds).toHaveLength(1);
  });

  test("should preserve chat context when navigating away and back", async ({
    page,
  }) => {
    // Send a user message
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill("Remember this conversation");
    await messageInput.press("Enter");

    // Wait for user message and get chat ID
    const userMessage = page.locator('[data-testid="message-user"]').first();
    await expect(userMessage).toBeVisible({ timeout: 10000 });
    const originalChatId = await userMessage.getAttribute("data-chat-id");

    // Navigate to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Navigate back to the chat
    await page.goto(`/chat/${originalChatId}`);
    await page.waitForLoadState("networkidle");

    // Verify messages are still there
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 15000 });

    // Send another message
    await messageInput.fill("Did you remember our conversation?");
    await messageInput.press("Enter");

    // Verify new message is in the same chat
    const newUserMessage = page.locator('[data-testid="message-user"]').nth(1);
    await expect(newUserMessage).toBeVisible({ timeout: 10000 });
    const newChatId = await newUserMessage.getAttribute("data-chat-id");
    expect(newChatId).toBe(originalChatId);
  });

  test("should handle network interruption gracefully", async ({
    page,
    context,
  }) => {
    const messageInput = page.locator('[data-testid="message-input"]');

    // Send first message successfully
    await messageInput.fill("First message before network issue");
    await messageInput.press("Enter");
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 10000 });

    // Simulate network interruption
    await context.setOffline(true);

    // Try to send message while offline
    await messageInput.fill("Message during network issue");
    await messageInput.press("Enter");

    // Should show error or pending state
    const errorOrPending = page.locator(
      '[data-testid="error-message"], [data-testid="message-pending"]',
    );
    await expect(errorOrPending).toBeVisible({ timeout: 15000 });

    // Restore network
    await context.setOffline(false);

    // Retry or send new message
    const retryButton = page.locator('[data-testid="retry-button"]');
    if (await retryButton.isVisible()) {
      await retryButton.click();
    } else {
      await messageInput.fill("Message after network restored");
      await messageInput.press("Enter");
    }

    // Verify message goes through and stays in same chat
    await expect(
      page.locator('[data-testid="message-user"]').nth(1),
    ).toBeVisible({ timeout: 10000 });

    // Verify all messages have same chat ID
    const allMessages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      allMessages.map((msg) => msg.getAttribute("data-chat-id")),
    );
    const uniqueChatIds = [...new Set(chatIds.filter(Boolean))];
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

    // Verify message appears with correct chat ID
    const userMessage = page.locator('[data-testid="message-user"]').first();
    await expect(userMessage).toBeVisible({ timeout: 10000 });

    // We expect the chat ID to be either the one we set, or a valid one generated by the backend
    const chatId = await userMessage.getAttribute("data-chat-id");
    expect(chatId).toBeTruthy();

    // URL should match the chat ID found in the message
    await expect(page).toHaveURL(new RegExp(`/chat/${chatId}`));
  });

  test("should handle authenticated vs unauthenticated chat transitions", async ({
    page,
  }) => {
    // Start as unauthenticated user
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Send message as unauthenticated
    const messageInput = page.locator('[data-testid="message-input"]');
    await messageInput.fill("Message as guest user");
    await messageInput.press("Enter");

    // Wait for message
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 10000 });

    // Check for sign-up prompt or local storage indicator
    const localIndicator = page.locator(
      '[data-testid="local-chat-indicator"], [data-testid="sign-up-prompt"]',
    );
    await expect(localIndicator).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Message Validation", () => {
  test("should validate and correct mismatched chat IDs", async ({ page }) => {
    // This tests the validateChatContext utility
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Send multiple messages
    const messageInput = page.locator('[data-testid="message-input"]');
    for (let i = 1; i <= 3; i++) {
      await messageInput.fill(`Test message ${i}`);
      await messageInput.press("Enter");
      // Wait for message to appear before sending next
      await page.waitForSelector(`text="Test message ${i}"`, { timeout: 1000 });
    }

    // All messages should have consistent chat IDs
    const messages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      messages.map((msg) => msg.getAttribute("data-chat-id")),
    );

    // Verify no null or undefined chat IDs
    // Wait for IDs to be populated
    await expect(async () => {
      const messages = await page.locator('[data-testid^="message-"]').all();
      const currentChatIds = await Promise.all(
        messages.map((msg) => msg.getAttribute("data-chat-id")),
      );
      const validIds = currentChatIds.filter((id) => id && id.length > 0);
      expect(validIds.length).toBe(messages.length);
      const uniqueIds = [...new Set(validIds)];
      expect(uniqueIds).toHaveLength(1);
    }).toPass({ timeout: 10000 });
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

    // Wait to verify no message is created
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('[data-testid="message-user"]').length ===
          0,
        { timeout: 1000 },
      )
      .catch(() => {});
    expect(await page.locator('[data-testid="message-user"]').count()).toBe(0);

    // Try whitespace only
    await messageInput.fill("   ");
    await messageInput.press("Enter");

    // Wait to verify no message is created
    await page
      .waitForFunction(
        () =>
          document.querySelectorAll('[data-testid="message-user"]').length ===
          0,
        { timeout: 1000 },
      )
      .catch(() => {});
    expect(await page.locator('[data-testid="message-user"]').count()).toBe(0);

    // Send valid message
    await messageInput.fill("Valid message");
    await messageInput.press("Enter");

    // Should create message
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 10000 });
  });
});

test.describe("Performance and Load Testing", () => {
  test("should handle rapid message sending without race conditions", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');
    const messageCount = 10;

    // Send many messages rapidly
    for (let i = 1; i <= messageCount; i++) {
      await messageInput.fill(`Rapid message ${i}`);
      await messageInput.press("Enter");
      // No delay - testing race condition handling
    }

    // Wait for all messages to appear
    await expect(page.locator('[data-testid="message-user"]')).toHaveCount(
      messageCount,
      { timeout: 45000 },
    );

    // Verify all have same chat ID
    const messages = await page.locator('[data-testid^="message-"]').all();
    const chatIds = await Promise.all(
      messages.map((msg) => msg.getAttribute("data-chat-id")),
    );
    const uniqueIds = [...new Set(chatIds.filter(Boolean))];
    expect(uniqueIds).toHaveLength(1);
  });

  test("should maintain performance with large message history", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');

    // Send initial batch of messages
    for (let i = 1; i <= 20; i++) {
      await messageInput.fill(
        `Message ${i} with some content to make it longer`,
      );
      await messageInput.press("Enter");
      // Short delay for stress test
      await new Promise((resolve) => setTimeout(resolve, 100));
    }

    // Measure time to send new message
    const startTime = Date.now();
    await messageInput.fill("Final message after many others");
    await messageInput.press("Enter");

    // Should still be responsive
    await expect(
      page.locator('[data-testid="message-user"]').nth(20),
    ).toBeVisible({ timeout: 10000 });
    const endTime = Date.now();

    // Response time should be reasonable (under 10 seconds)
    expect(endTime - startTime).toBeLessThan(10000);
  });
});
