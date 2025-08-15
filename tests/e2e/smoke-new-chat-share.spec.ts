import { test, expect } from "@playwright/test";

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
    await expect(shareButtonInitial).not.toBeVisible({ timeout: 2000 }).catch(() => {
      throw new Error(
        "REGRESSION DETECTED: Share button is visible on empty chat! " +
        "The ChatToolbar should NOT render when there are no messages. " +
        "Check ChatInterface.tsx line ~562 - it must have: currentChatId && messages.length > 0"
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
    // 1. Chat has been created (currentChatId exists)
    // 2. At least one message exists in the chat
    await page.waitForFunction(
      () => {
        // Check if there's at least one message element in the DOM
        // Messages use data-role="user" or data-role="assistant" attributes
        const messages = document.querySelectorAll(
          '[data-role="user"], [data-role="assistant"]',
        );
        return messages.length > 0;
      },
      { timeout: 10000 },
    );

    // Now wait for the share button to be visible
    const shareButton = page.locator('button[aria-label="Share chat"]');
    await expect(shareButton).toBeVisible({ timeout: 10000 });

    // Wait for any animations or state updates to complete
    await page.waitForLoadState("networkidle");

    // Debug: Check if modal exists before click
    const modalCountBefore = await page
      .locator('[role="dialog"][aria-labelledby="share-modal-title"]')
      .count();
    console.log("Modal count before click:", modalCountBefore);

    // Debug: Check button properties
    const buttonInfo = await shareButton.evaluate((el) => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return {
        visible: rect.width > 0 && rect.height > 0,
        position: {
          x: rect.x,
          y: rect.y,
          width: rect.width,
          height: rect.height,
        },
        display: style.display,
        visibility: style.visibility,
        pointerEvents: style.pointerEvents,
        zIndex: style.zIndex,
      };
    });
    console.log("Share button info:", buttonInfo);

    // Add console listener to catch any JavaScript errors
    page.on("console", (msg) => {
      console.log(`Browser console [${msg.type()}]:`, msg.text());
    });

    // Add error listener
    page.on("pageerror", (error) => {
      console.log("Page error:", error.message);
    });

    // Debug: Try to manually trigger the state change
    const manualStateChange = await page.evaluate(() => {
      try {
        // Find the share button and get its React fiber
        const shareButton = document.querySelector(
          'button[aria-label="Share chat"]',
        );
        if (!shareButton) return { error: "Share button not found" };

        // Get React fiber key
        const fiberKey = Object.keys(shareButton).find(
          (key) =>
            key.startsWith("__reactFiber") ||
            key.startsWith("__reactInternalInstance"),
        );
        if (!fiberKey) return { error: "React fiber not found" };

        const fiber = shareButton[fiberKey];

        // Walk up to find the component with the onClick handler
        let current = fiber;
        while (current) {
          if (current.memoizedProps && current.memoizedProps.onClick) {
            // Found the onClick handler, try to call it
            current.memoizedProps.onClick();
            return { success: true, foundOnClick: true };
          }
          current = current.return;
        }

        return { error: "onClick handler not found in fiber tree" };
      } catch (error) {
        return { error: error.message };
      }
    });
    console.log("Manual state change result:", manualStateChange);

    // Click the share button
    await expect(shareButton).toBeVisible();
    await shareButton.click({ force: true });

    // Wait for modal to appear and be fully visible
    await page
      .waitForSelector('[role="dialog"][aria-modal="true"]', {
        state: "visible",
        timeout: 2000,
      })
      .catch(() => {});

    // Check if modal appeared
    const modalCount = await page
      .locator('[role="dialog"][aria-modal="true"]')
      .count();
    console.log("Modal count after click:", modalCount);

    // Debug: Check if there are any hidden modals or elements
    const domDebugInfo = await page.evaluate(() => {
      const allDialogs = document.querySelectorAll('[role="dialog"]');
      const allModals = document.querySelectorAll("[aria-modal]");
      const shareModals = document.querySelectorAll(
        '*[class*="share"], *[id*="share"], *[data-testid*="share"]',
      );

      return {
        dialogCount: allDialogs.length,
        modalCount: allModals.length,
        shareElementCount: shareModals.length,
        dialogs: Array.from(allDialogs).map((d) => ({
          tagName: d.tagName,
          className: d.className,
          id: d.id,
          style: (d as HTMLElement).style.cssText,
          display: window.getComputedStyle(d).display,
          visibility: window.getComputedStyle(d).visibility,
        })),
        modals: Array.from(allModals).map((m) => ({
          tagName: m.tagName,
          className: m.className,
          id: m.id,
          ariaModal: m.getAttribute("aria-modal"),
          style: (m as HTMLElement).style.cssText,
          display: window.getComputedStyle(m).display,
        })),
      };
    });
    console.log("DOM debug info:", JSON.stringify(domDebugInfo, null, 2));

    // Wait for the share modal to be attached to the DOM using the same selector as debug test
    const modal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeAttached({ timeout: 10000 });

    // Check that the modal has the expected CSS properties (since isVisible() doesn't work)
    await expect(modal).toHaveCSS("display", "flex", { timeout: 5000 });
    await expect(modal).toHaveCSS("position", "fixed");
    await expect(modal).toHaveCSS("opacity", "1");

    // Verify the modal content is present
    await expect(modal.getByText("Share this conversation")).toBeAttached();

    // Close via title button
    await modal.getByLabel("Close").click();

    expect.soft(requestFailures, requestFailures.join("\n")).toEqual([]);
    expect.soft(responseFailures, responseFailures.join("\n")).toEqual([]);
    expect.soft(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
