/**
 * Integration tests for chat message race condition handling
 * Tests ensure messages maintain consistent chat IDs across operations
 */

import { test, expect, type Page } from "@playwright/test";

// Skip on Firefox and WebKit due to stability issues
test.skip(
  ({ browserName }) => browserName === "firefox" || browserName === "webkit",
  "Integration suite unstable on Firefox and WebKit",
);

const USER_MSG = '[data-testid="message-user"]';
const ANY_MSG = '[data-testid^="message-"]';

/**
 * Send a message and wait for the user message count to reach `expectedCount`.
 * Asserting on the concrete testid count is deterministic — unlike text-matching
 * which can match transient elements (input echo, toast, etc.) and miss DOM
 * re-renders that temporarily remove messages during route transitions.
 */
async function sendAndWaitForCount(
  page: Page,
  text: string,
  expectedCount: number,
): Promise<void> {
  const input = page.locator('[data-testid="message-input"]');
  await input.fill(text);
  await input.press("Enter");
  await expect(page.locator(USER_MSG)).toHaveCount(expectedCount, {
    timeout: 30_000,
  });
}

/** Collect all non-null chat IDs from every message element on the page. */
async function collectChatIds(page: Page): Promise<string[]> {
  const elements = await page.locator(ANY_MSG).all();
  const ids = await Promise.all(
    elements.map((el) => el.getAttribute("data-chat-id")),
  );
  return ids.filter((id): id is string => id !== null && id.length > 0);
}

test.describe("Race Condition Fix - Assistant First Message", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");
  });

  test("should maintain same chat when user replies to assistant-first message", async ({
    page,
  }) => {
    await sendAndWaitForCount(page, "Hello, I need help with searching", 1);

    const userMessage = page.locator(USER_MSG).first();
    const chatIdFromUser = await userMessage.getAttribute("data-chat-id");
    expect(chatIdFromUser).toBeTruthy();

    // Wait for assistant response
    const assistantMessage = page
      .locator('[data-testid="message-assistant"]')
      .first();
    await expect(assistantMessage).toBeVisible({ timeout: 45_000 });

    const chatIdFromAssistant =
      await assistantMessage.getAttribute("data-chat-id");
    expect(chatIdFromAssistant).toBe(chatIdFromUser);

    // Verify URL contains chat ID
    await expect(page).toHaveURL(/\/chat\/[^/]+/, { timeout: 30_000 });
    const urlChatId = page.url().split("/chat/")[1];
    expect(urlChatId).toBe(chatIdFromUser);

    // Send second message and wait for count to reach 2
    await sendAndWaitForCount(
      page,
      "Can you search for TypeScript tutorials?",
      2,
    );

    const secondChatId = await page
      .locator(USER_MSG)
      .nth(1)
      .getAttribute("data-chat-id");
    expect(secondChatId).toBe(chatIdFromUser);
  });

  test("should handle multiple messages without creating new chats", async ({
    page,
  }) => {
    const messages = [
      "First message",
      "Second message quickly",
      "Third message very fast",
    ];

    for (let i = 0; i < messages.length; i++) {
      await sendAndWaitForCount(page, messages[i], i + 1);
    }

    const chatIds = await collectChatIds(page);
    expect(chatIds.length).toBeGreaterThan(0);
    expect(new Set(chatIds).size).toBe(1);
  });
});

test.describe("Chat State Management", () => {
  test("should correctly initialize chat from URL parameters", async ({
    page,
  }) => {
    const testChatId = "test_chat_" + Date.now();
    await page.goto(`/chat/${testChatId}`);
    await page.waitForLoadState("networkidle");

    await sendAndWaitForCount(page, "Testing direct chat navigation", 1);

    const chatId = await page
      .locator(USER_MSG)
      .first()
      .getAttribute("data-chat-id");
    expect(chatId).toBeTruthy();

    const escaped = (chatId ?? "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    await expect(page).toHaveURL(new RegExp(`/chat/${escaped}`));
  });
});

test.describe("Message Validation", () => {
  test("should validate and correct mismatched chat IDs", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    for (let i = 1; i <= 3; i++) {
      await sendAndWaitForCount(page, `Test message ${i}`, i);
    }

    // All messages should share one chat ID
    await expect(async () => {
      const chatIds = await collectChatIds(page);
      expect(chatIds.length).toBeGreaterThan(0);
      expect(new Set(chatIds).size).toBe(1);
    }).toPass({ timeout: 30_000 });
  });

  test("should handle edge case of empty or whitespace messages", async ({
    page,
  }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageInput = page.locator('[data-testid="message-input"]');

    // Empty message should not create a user message
    await messageInput.fill("");
    await messageInput.press("Enter");
    await expect(page.locator(USER_MSG)).toHaveCount(0);

    // Whitespace-only should not create a user message
    await messageInput.fill("   ");
    await messageInput.press("Enter");
    await expect(page.locator(USER_MSG)).toHaveCount(0);

    await sendAndWaitForCount(page, "Valid message", 1);
  });
});

test.describe("Performance Testing", () => {
  test("should handle sequential message sending", async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    const messageCount = 5;

    for (let i = 1; i <= messageCount; i++) {
      await sendAndWaitForCount(page, `Sequential message ${i}`, i);
    }

    const chatIds = await collectChatIds(page);
    expect(chatIds.length).toBeGreaterThan(0);
    expect(new Set(chatIds).size).toBe(1);
  });
});
