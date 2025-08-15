/**
 * Critical Path Smoke Tests
 * These tests verify the most important user flows work end-to-end
 */

import { test, expect } from "@playwright/test";
import { setupMSWForTest, cleanupMSWForTest } from "../helpers/setup-msw";

test.describe("Critical User Paths", () => {
  test("user can create and send a message", async ({ page }) => {
    await setupMSWForTest(page);
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

    await cleanupMSWForTest(page);
  });

  test("user can create new chat", async ({ page }) => {
    await setupMSWForTest(page);
    await page.goto("/");

    // Click new chat button
    const newChatBtn = page.locator('button:has-text("New Chat")').first();
    await expect(newChatBtn).toBeVisible({ timeout: 10000 });
    await newChatBtn.click();

    // Verify URL changed
    await expect(page).toHaveURL(/\/chat\/.+/, { timeout: 5000 });

    await cleanupMSWForTest(page);
  });

  test("authentication flow works", async ({ page }) => {
    await setupMSWForTest(page);
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

    await cleanupMSWForTest(page);
  });

  test("share functionality exists", async ({ page }) => {
    await setupMSWForTest(page);
    await page.goto("/");

    // Create a message first
    const input = page
      .locator('textarea[placeholder*="Type"], [data-testid="message-input"]')
      .first();
    await input.fill("Message to share");
    await input.press("Enter");

    // Wait for the message to be processed and chat to be created
    await expect(
      page.locator('text="Message to share"'),
    ).toBeVisible({ timeout: 15000 });

    // Wait a bit for the chat to be fully created
    await page.waitForTimeout(2000);

    // Look for share button - it should now be visible
    const shareBtn = page
      .locator('[title*="Share"], button:has-text("Share")')
      .first();
    await expect(shareBtn).toBeVisible({ timeout: 10000 });

    await cleanupMSWForTest(page);
  });

  test("AI response generation works", async ({ page }) => {
    await setupMSWForTest(page);
    await page.goto("/");

    // Send a message that should trigger AI
    const input = page
      .locator('textarea[placeholder*="Type"], [data-testid="message-input"]')
      .first();
    await input.fill("What is 2+2?");
    await input.press("Enter");

    // Wait for assistant response
    await expect(
      page.locator('[data-role="assistant"], .assistant-message').first(),
    ).toBeVisible({ timeout: 30000 });

    await cleanupMSWForTest(page);
  });
});
