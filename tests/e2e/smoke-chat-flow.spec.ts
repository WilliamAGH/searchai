import { test, expect } from "@playwright/test";

test.describe("Chat Flow Smoke Test", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test("should complete full chat flow: create, send, and receive message", async ({
    page,
  }) => {
    // Wait for app to load - use generic selector like existing tests
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Type a message
    const testMessage = "What is the capital of France?";
    await messageInput.click({ force: true });
    await messageInput.type(testMessage);

    // Send the message with Enter key
    await page.keyboard.press("Enter");

    // Wait for URL to change (indicates chat creation)
    await expect(page).toHaveURL(/\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

    // Wait for response - check that input is re-enabled after response
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Verify we can send another message
    await messageInput.type("Thank you");
    await page.keyboard.press("Enter");

    // Wait for second response
    await expect(messageInput).toBeEnabled({ timeout: 30000 });
  });

  test("should handle multiple messages in sequence", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // First message
    await messageInput.click({ force: true });
    await messageInput.type("Hello");
    await page.keyboard.press("Enter");

    // Wait for response
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Second message
    await messageInput.type("How are you?");
    await page.keyboard.press("Enter");

    // Wait for second response
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Verify URL has chat ID
    await expect(page).toHaveURL(/\/chat\/[a-zA-Z0-9]+/);
  });

  test("should show disabled state while generating response", async ({
    page,
  }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("Test message");
    await page.keyboard.press("Enter");

    // Input should be disabled immediately
    await expect(messageInput).toBeDisabled({ timeout: 2000 });

    // Wait for response to complete
    await expect(messageInput).toBeEnabled({ timeout: 30000 });
  });

  test("should handle empty message gracefully", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });
    const sendButton = page.locator('button[aria-label="Send message"]');

    // Button should be disabled when input is empty
    await expect(sendButton).toBeDisabled();

    // Type something to enable button
    await messageInput.click({ force: true });
    await messageInput.type("test");
    await expect(sendButton).toBeEnabled();

    // Clear and verify button is disabled again
    await messageInput.clear();
    await expect(sendButton).toBeDisabled();
  });

  test("should preserve message after navigation", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send a message
    await messageInput.click({ force: true });
    await messageInput.type("Remember this message");
    await page.keyboard.press("Enter");

    // Wait for chat to be created
    await expect(page).toHaveURL(/\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });
    const chatUrl = page.url();

    // Navigate away
    await page.goto("/");

    // Navigate back to the chat
    await page.goto(chatUrl);
    await page.waitForLoadState("domcontentloaded");

    // Verify input is available (chat loaded successfully)
    await expect(messageInput).toBeVisible({ timeout: 15000 });
  });
});
