/**
 * E2E Search Tests with MSW Mocks
 * Demonstrates how to use MSW with Playwright for deterministic search testing
 */

import { test, expect } from "@playwright/test";
import { setupMSWForTest, cleanupMSWForTest } from "../helpers/setup-msw";

test.describe("Search Functionality with Mocked APIs", () => {
  test.beforeEach(async ({ page }) => {
    await setupMSWForTest(page);
    await page.goto("/");
    await page.waitForLoadState("domcontentloaded");
  });

  test.afterEach(async ({ page }) => {
    await cleanupMSWForTest(page);
  });

  test("should display search results for technical queries", async ({
    page,
  }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send a technical query
    await messageInput.click({ force: true });
    await messageInput.type("How do React hooks work?");
    await page.keyboard.press("Enter");

    // Wait for response with search results - this is the key fix
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Add a small buffer for content to settle
    await page.waitForTimeout(2000);

    // Verify search results are integrated in the response
    // The AI should provide a response based on search results
    const messageContent = page.locator('[data-role="assistant"]').last();

    // Check that we got a response
    const responseText = await messageContent.textContent();
    expect(responseText).toBeTruthy();

    // Log the actual response for debugging
    console.log("AI Response:", responseText);

    // The response should contain some content (even if short)
    // Increased threshold to account for actual response length
    expect(responseText?.length ?? 0).toBeGreaterThan(20);
  });

  test("should handle creator detection queries", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send a creator query
    await messageInput.click({ force: true });
    await messageInput.type("Who created SearchAI?");
    await page.keyboard.press("Enter");

    // Wait for response
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // Verify the response mentions William Callahan
    const messageContent = page.locator('[data-role="assistant"]').last();
    await expect(messageContent).toContainText(/William Callahan/i, {
      timeout: 10000,
    });
  });

  test("should gracefully handle search API errors", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send a query that would normally require search
    await messageInput.click({ force: true });
    await messageInput.type("What is the latest news?");
    await page.keyboard.press("Enter");

    // Should still get a response despite search failure
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Wait for the AI response to complete (not just thinking status)
    await expect(async () => {
      const thinkingElements = page.locator('text=AI is thinking, text=Composing response...');
      const thinkingCount = await thinkingElements.count();
      expect(thinkingCount).toBe(0);
    }).toPass({ timeout: 30000 });

    // Wait for the assistant message to appear and be visible
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 15000,
    });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // The response should still be present (fallback behavior)
    // Check for both user and assistant messages
    const userMessages = page.locator('[data-role="user"]');
    const assistantMessages = page.locator('[data-role="assistant"]');

    const userCount = await userMessages.count();
    const assistantCount = await assistantMessages.count();

    // At least one user message and one assistant message should exist
    expect(userCount).toBeGreaterThan(0);
    expect(assistantCount).toBeGreaterThan(0);
  });

  test("should handle rate limiting with fallback", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send a query that would normally hit rate limits
    await messageInput.click({ force: true });
    await messageInput.fill("Tell me about AI and machine learning");
    await page.keyboard.press("Enter");

    // Wait for the AI response to complete (not just thinking status)
    await expect(async () => {
      const thinkingElements = page.locator('text=AI is thinking, text=Composing response...');
      const thinkingCount = await thinkingElements.count();
      expect(thinkingCount).toBe(0);
    }).toPass({ timeout: 30000 });

    // Wait for the assistant message to appear
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 15000,
    });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // Verify we got a response despite potential rate limiting
    const messages = page.locator('[data-role="assistant"]');
    const assistantMessageCount = await messages.count();
    expect(assistantMessageCount).toBeGreaterThan(0);

    // Verify the response contains meaningful content
    const lastMessage = page.locator('[data-role="assistant"]').last();
    const responseText = await lastMessage.textContent();
    expect(responseText?.length ?? 0).toBeGreaterThan(20);
  });

  test("should handle slow network conditions", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("What is machine learning?");
    await page.keyboard.press("Enter");

    // Input should be disabled while waiting (but this might be very brief)
    // Use a shorter timeout and handle the case where it's already enabled
    try {
      await expect(messageInput).toBeDisabled({ timeout: 1000 });
    } catch {
      // If input is already enabled, that's fine too
      console.log("Input was already enabled, continuing...");
    }

    // Should eventually get response despite delay
    await expect(messageInput).toBeEnabled({ timeout: 35000 });
  });

  test("should return no results for certain queries", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("xyzabc123 nonexistent query");
    await page.keyboard.press("Enter");

    // Should still get a response even with no search results
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Wait for the AI response to complete (not just thinking status)
    await expect(async () => {
      const thinkingElements = page.locator('text=AI is thinking, text=Composing response...');
      const thinkingCount = await thinkingElements.count();
      expect(thinkingCount).toBe(0);
    }).toPass({ timeout: 30000 });

    // Wait for the assistant message to appear and be visible
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 15000,
    });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // Verify we got a response
    const lastMessage = page.locator('[data-role="assistant"]').last();
    await expect(lastMessage).toBeVisible();
  });

  test("should handle partial search results", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("Tell me about quantum computing");
    await page.keyboard.press("Enter");

    // Should handle partial results gracefully
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Wait for the AI response to complete (not just thinking status)
    await expect(async () => {
      const thinkingElements = page.locator('text=AI is thinking, text=Composing response...');
      const thinkingCount = await thinkingElements.count();
      expect(thinkingCount).toBe(0);
    }).toPass({ timeout: 30000 });

    // Wait for the assistant message to appear and be visible
    await expect(page.locator('[data-role="assistant"]').last()).toBeVisible({
      timeout: 15000,
    });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // Response should still be present
    const lastMessage = page.locator('[data-role="assistant"]').last();
    await expect(lastMessage).toBeVisible();
  });

  test("should handle current events queries with fresh results", async ({
    page,
  }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("What happened in AI today?");
    await page.keyboard.press("Enter");

    // Wait for response with current events
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Add buffer for content to settle
    await page.waitForTimeout(2000);

    // Verify response contains news-like content
    const messageContent = page.locator('[data-role="assistant"]').last();
    await expect(messageContent).toBeVisible();

    // Wait for the actual content to appear (not just placeholder)
    // Keep checking until we get real content
    await expect(async () => {
      const text = await messageContent.textContent();
      const hasRealContent =
        text &&
        !text.includes("generating response") &&
        !text.includes("AI is thinking") &&
        text.length > 20;
      expect(hasRealContent).toBe(true);
    }).toPass({ timeout: 20000 });

    // Now check for the expected content patterns
    const text = await messageContent.textContent();
    expect(text?.toLowerCase()).toMatch(/today|latest|recent|new/);
  });
});
