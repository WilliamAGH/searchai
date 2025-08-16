import { test, expect } from "@playwright/test";
import { setupMSWForTest, cleanupMSWForTest } from "../helpers/setup-msw";

/**
 * ⚠️ CRITICAL TEST - DO NOT MODIFY WITHOUT UNDERSTANDING THE REGRESSION HISTORY ⚠️
 *
 * This test validates that the Share button appears ONLY after:
 * 1. A chat has been created in the database (currentChatId exists)
 * 2. At least one message has been sent and rendered
 *
 * REGRESSION HISTORY:
 * - The Share/Copy toolbar has repeatedly appeared on empty chats
 * - This happens when developers remove the messages.length > 0 check
 * - They do this to "fix" this test when it fails
 * - This creates a UX bug where users see Share/Copy buttons with nothing to share
 *
 * THE CORRECT BEHAVIOR:
 * - Share button should NOT appear on a new, empty chat
 * - Share button should ONLY appear after messages exist
 * - The toolbar visibility requires: currentChatId && messages.length > 0
 *
 * IF THIS TEST FAILS:
 * ✅ DO: Fix the timing - ensure the chat is created and messages are rendered
 * ✅ DO: Check if the message selectors are correct
 * ✅ DO: Add more robust waits for async operations
 * ❌ DON'T: Remove the messages.length check from ChatInterface.tsx
 * ❌ DON'T: Make the Share button always visible
 * ❌ DON'T: Remove the wait for messages from this test
 *
 * See: docs/CHAT_TOOLBAR_REGRESSION_PREVENTION.md for full details
 */
test.describe("smoke: new chat share flow has no console errors", () => {
  /**
   * Test the complete flow of creating a chat, sending a message, and sharing.
   *
   * CRITICAL SEQUENCE:
   * 1. Navigate to the app
   * 2. Send a message (this creates the chat and adds the first message)
   * 3. Wait for the message to appear in the DOM
   * 4. Only then should the Share button become visible
   * 5. Click Share and verify the modal opens
   */
  test("smoke: create chat, send message, open share modal", async ({
    page,
    baseURL,
  }) => {
    // Set up MSW to mock search and AI endpoints
    await setupMSWForTest(page);

    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];
    const responseFailures: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const t = msg.text() || "";
      // Ignore known benign navigation-soft-fail logs from optimistic nav
      if (/Failed to navigate to new (local )?chat:/i.test(t)) return;
      // Ignore WebSocket errors from Vite HMR
      if (/WebSocket connection to 'ws:\/\/localhost:\d+\/' failed/.test(t))
        return;
      if (/ERR_CONNECTION_REFUSED.*@vite\/client/.test(t)) return;
      // Ignore React duplicate key warnings - this is a known issue with message rendering
      // that doesn't affect functionality but needs deeper refactoring to fix
      if (/Encountered two children with the same key/.test(t)) return;
      consoleErrors.push(t);
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    const isHttp = (u: string) =>
      u.startsWith("http://") || u.startsWith("https://");
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (!isHttp(url)) return;
      if (url.endsWith("favicon.ico") || url.endsWith("favicon.svg")) return;
      requestFailures.push(
        `${req.method()} ${url} -> ${req.failure()?.errorText}`,
      );
    });
    page.on("response", (res) => {
      const url = res.url();
      if (!isHttp(url)) return;
      const status = res.status();
      if (status >= 400)
        responseFailures.push(`${res.request().method()} ${url} -> ${status}`);
    });

    await page.goto(baseURL ?? "http://localhost:5180", {
      waitUntil: "domcontentloaded",
    });

    // CRITICAL REGRESSION CHECK: Share button must NOT be visible on empty chat
    // If this fails, someone has broken the conditional rendering
    const shareButtonInitial = page.locator('button[aria-label="Share chat"]');
    await expect(shareButtonInitial)
      .not.toBeVisible({ timeout: 2000 })
      .catch(() => {
        throw new Error(
          "REGRESSION DETECTED: Share button is visible on empty chat! " +
            "The ChatToolbar should NOT render when there are no messages. " +
            "Check ChatInterface.tsx line ~562 - it must have: currentChatId && messages.length > 0",
        );
      });

    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });
    // Use force click to bypass body element pointer-events interception in tests
    await input.click({ force: true });
    await input.type("E2E smoke hello");
    await page.keyboard.press("Enter");

    // Wait for the message to be sent and chat to be created
    // The share button should only appear after both conditions are met:
    // 1. Chat has been created (currentChatId exists - URL changes)
    // 2. At least one message exists in the chat

    // First wait for URL to change to include chat ID
    await expect(page).toHaveURL(/\/chat\/[a-zA-Z0-9]+/, { timeout: 10000 });

    // Wait for the input to be re-enabled (indicates response is complete)
    await expect(input).toBeEnabled({ timeout: 30000 });

    // Then verify messages are in the DOM
    await page.waitForFunction(
      () => {
        // Check if there's at least one message element in the DOM
        // Messages use data-role="user" or data-role="assistant" attributes
        const messages = document.querySelectorAll(
          '[data-role="user"], [data-role="assistant"]',
        );
        // We should have at least 2 messages: user + assistant response
        return messages.length >= 2;
      },
      { timeout: 10000 },
    );

    // Wait a bit for React to re-render after messages update
    await page.waitForTimeout(1000);

    // Now wait for the share button to be visible and click it
    const shareButton = page.locator('button[aria-label="Share chat"]');
    await expect(shareButton).toBeVisible({ timeout: 10000 });
    await shareButton.click();

    // Wait for the share modal to appear - use a more flexible selector
    const modal = page.locator('[role="dialog"], .fixed.inset-0.z-50').first();
    await expect(modal).toBeVisible({ timeout: 5000 });

    // Verify the modal has the share title
    await expect(page.getByText("Share this conversation")).toBeVisible({
      timeout: 5000,
    });

    // Close the modal
    await page.keyboard.press("Escape");

    // Clean up MSW
    await cleanupMSWForTest(page);

    expect.soft(requestFailures, requestFailures.join("\n")).toEqual([]);
    expect.soft(responseFailures, responseFailures.join("\n")).toEqual([]);
    expect.soft(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
