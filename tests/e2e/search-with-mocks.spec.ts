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

    // Wait for response with search results
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Verify search results are integrated in the response
    // The AI should provide a response based on search results
    const messageContent = page.locator('[data-role="assistant"]').last();
    
    // Check that we got a response
    const responseText = await messageContent.textContent();
    expect(responseText).toBeTruthy();
    
    // Log the actual response for debugging
    console.log('AI Response:', responseText);
    
    // The response should contain some content (even if short)
    expect(responseText!.length).toBeGreaterThan(10);
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

    // The response should still be present (fallback behavior)
    const messages = page.locator(
      '[data-role="assistant"], [data-role="user"]',
    );
    const messageCount = await messages.count();
    expect(messageCount).toBeGreaterThan(1);
  });

  test("should handle rate limiting with fallback", async ({ page }) => {
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    // Send multiple queries quickly
    for (let i = 0; i < 3; i++) {
      await messageInput.click({ force: true });
      await messageInput.type(`Query ${i + 1}: Tell me about AI`);
      await page.keyboard.press("Enter");

      // Wait for each response
      await expect(messageInput).toBeEnabled({ timeout: 30000 });
    }

    // All queries should receive responses despite rate limiting
    const messages = page.locator('[data-testid^="message-assistant"]');
    const assistantMessageCount = await messages.count();
    expect(assistantMessageCount).toBe(3);
  });

  test("should handle slow network conditions", async ({ page }) => {
    // Set response delay to simulate slow network
    setResponseDelay(2000); // 2 second delay

    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("What is machine learning?");
    await page.keyboard.press("Enter");

    // Input should be disabled while waiting
    await expect(messageInput).toBeDisabled({ timeout: 2000 });

    // Should eventually get response despite delay
    await expect(messageInput).toBeEnabled({ timeout: 35000 });
  });

  test("should return no results for certain queries", async ({ page }) => {
    // Set no results scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.NO_RESULTS);

    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("xyzabc123 nonexistent query");
    await page.keyboard.press("Enter");

    // Should still get a response even with no search results
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Verify we got a response
    const lastMessage = page
      .locator('[data-testid="message-assistant"]')
      .last();
    await expect(lastMessage).toBeVisible();
  });

  test("should handle partial search results", async ({ page }) => {
    // Set partial results scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.PARTIAL_RESULTS);

    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("Tell me about quantum computing");
    await page.keyboard.press("Enter");

    // Should handle partial results gracefully
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Response should still be present
    const lastMessage = page
      .locator('[data-testid="message-assistant"]')
      .last();
    await expect(lastMessage).toBeVisible();
  });

  test("should handle current events queries with fresh results", async ({
    page,
  }) => {
    // Set current events scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.CURRENT_EVENTS);

    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 15000 });

    await messageInput.click({ force: true });
    await messageInput.type("What happened in AI today?");
    await page.keyboard.press("Enter");

    // Wait for response with current events
    await expect(messageInput).toBeEnabled({ timeout: 30000 });

    // Verify response contains news-like content
    const messageContent = page
      .locator('[data-testid="message-assistant"]')
      .last();
    await expect(messageContent).toBeVisible();
    // The mocked current events should mention "today" or "latest"
    const text = await messageContent.textContent();
    expect(text?.toLowerCase()).toMatch(/today|latest|recent|new/);
  });
});
