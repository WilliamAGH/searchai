/**
 * Critical Path Smoke Tests
 * These tests verify the most important user flows work end-to-end
 */

import { test, expect } from "@playwright/test";

test.describe("Critical User Paths", () => {
  test("user can create and send a message", async ({ page }) => {
    await page.goto("/");

    // Find message input
    const input = page
      .locator('textarea[placeholder*="Type"], [data-testid="message-input"]')
      .first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // Type and send message
    await input.fill("Test message for smoke test");
    await input.press("Enter");

    // Verify message appears
    await expect(
      page.locator('text="Test message for smoke test"'),
    ).toBeVisible({
      timeout: 15000,
    });
  });

  test("user can create new chat", async ({ page }) => {
    await page.goto("/");

    // Click new chat button
    const newChatBtn = page.locator('button:has-text("New Chat")').first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });
    await newChatBtn.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/chat\/.+/, { timeout: 5000 });
  });

  test("authentication flow works", async ({ page }) => {
    await page.goto("/");

    // Look for sign in button
    const signInBtn = page
      .locator('button:has-text("Sign"), a:has-text("Sign")')
      .first();

    if (await signInBtn.isVisible({ timeout: 3000 })) {
      await signInBtn.click();

      // Verify auth modal appears
      await expect(
        page.locator('[role="dialog"], .auth-modal, .sign-in-modal').first(),
      ).toBeVisible({ timeout: 5000 });
    }
  });

  test("share functionality exists", async ({ page }) => {
    await page.goto("/");

    // Wait for message input to be ready
    const input = page
      .locator('textarea[placeholder*="Type"], [data-testid="message-input"]')
      .first();
    await expect(input).toBeVisible({ timeout: 10000 });

    // Create a message first
    await input.fill("Message to share");
    await input.press("Enter");

    // Wait for message to be sent (user message appears)
    await expect(
      page.locator('[data-testid="message-user"]').first(),
    ).toBeVisible({ timeout: 10000 });

    // Look for share button - it's in MessageInput with aria-label="Share chat"
    const shareBtn = page.locator('button[aria-label="Share chat"]').first();
    await expect(shareBtn).toBeVisible({ timeout: 10000 });
  });

  test("AI response generation works", async ({ page }) => {
    await page.goto("/");

    // Send a message that should trigger AI
    const input = page
      .locator('textarea[placeholder*="Type"], [data-testid="message-input"]')
      .first();
    await input.fill("What is 2+2?");
    await input.press("Enter");

    // Wait for assistant response
    // Messages use data-testid="message-{role}" format
    await expect(
      page.locator('[data-testid="message-assistant"]').first(),
    ).toBeVisible({ timeout: 30000 });
  });
});
