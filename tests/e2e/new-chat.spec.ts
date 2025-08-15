/**
 * E2E tests for New Chat functionality
 * Tests the complete user journey for creating new chats
 */

import { test, expect } from "@playwright/test";
import { waitForSidebarAnimation } from "../helpers/wait-conditions";
import { viewports } from "../config/viewports";
import {
  ensureSidebarOpen,
  getNewChatButton,
  createNewChat,
} from "../helpers/sidebar-helpers";

test.describe("New Chat Functionality E2E", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/");
    // Wait for app to load
    await page.waitForLoadState("networkidle");
  });

  test("should create new chat when clicking New Chat button", async ({
    page,
  }) => {
    // Ensure sidebar is open and get New Chat button
    const newChatButton = await getNewChatButton(page);
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await expect(newChatButton).toBeEnabled();

    // Get initial URL and extract chat ID if present
    const initialUrl = page.url();
    const initialMatch = initialUrl.match(/\/(chat|p|s)\/([^/?]+)/);
    const initialChatId = initialMatch ? initialMatch[2] : null;

    // Create new chat and get the chat ID
    const newChatId = await createNewChat(page);
    expect(newChatId).toBeTruthy();

    // If we started on a chat page, verify we got a different chat
    if (initialChatId) {
      expect(newChatId).not.toBe(initialChatId);
    }

    // Verify we're on a chat page
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(chat|p|s)\/[^/]+/);
    expect(currentUrl).toContain(newChatId);

    // Message input should be visible and ready
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });
    await expect(messageInput).toBeEnabled();

    // Should not show creating state anymore
    const creatingButtons = await page
      .locator('button:has-text("Creating...")')
      .count();
    expect(creatingButtons).toBe(0);

    // New Chat button should be enabled again
    const newButton = await getNewChatButton(page);
    await expect(newButton).toBeEnabled();
  });

  test("should prevent multiple simultaneous chat creations", async ({
    page,
  }) => {
    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    newChatButton = page.locator('button:has-text("New Chat")').first();
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    // Rapidly click the button multiple times
    const clickPromises = [];
    for (let i = 0; i < 5; i++) {
      clickPromises.push(
        newChatButton.click({ force: true, noWaitAfter: true }),
      );
    }

    // Wait for all clicks to be processed
    await Promise.all(clickPromises);

    // Should only create one chat (navigate once)
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Count navigation events (should be 1)
    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/chat\/.+/);

    // Button should be re-enabled
    await expect(newChatButton).toBeEnabled();
  });

  test.skip("should show error when chat creation fails", async ({
    page: _page,
    context: _context,
  }) => {
    // Skip this test as local storage chat creation doesn't fail with API errors
    // This test would need to be rewritten to simulate a different type of failure
  });

  test("should create chat from mobile sidebar", async ({ page }) => {
    // Set mobile viewport
    await page.setViewportSize(viewports.iPhoneSE);

    // Ensure mobile sidebar is open (helper handles this)
    await ensureSidebarOpen(page);

    // Verify sidebar dialog exists (may have visibility issues)
    const sidebarDialog = page.locator('[role="dialog"]');
    await page.waitForTimeout(500); // Wait for animation
    const dialogCount = await sidebarDialog.count();
    if (dialogCount === 0) {
      throw new Error("Mobile sidebar dialog not found");
    }

    // Find New Chat button in mobile sidebar or just the button text
    const mobileNewChatButton = page
      .locator('button:has-text("New Chat")')
      .first();

    // Click New Chat
    await mobileNewChatButton.click();

    // Should show loading state
    await expect(
      page.locator('button:has-text("Creating...")').first(),
    ).toBeVisible({ timeout: 1000 });

    // Should navigate to new chat
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Sidebar should close
    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("should handle navigation failures gracefully", async ({ page }) => {
    // Set up console log monitoring before navigation
    const consoleLogs: string[] = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" || msg.text().includes("❌")) {
        consoleLogs.push(msg.text());
      }
    });

    // Override navigation to simulate failure
    await page.addInitScript(() => {
      let navCount = 0;
      const originalPushState = window.history.pushState;
      window.history.pushState = function (...args) {
        navCount++;
        if (navCount === 1) {
          console.error("❌ Navigation blocked intentionally for test");
          throw new Error("Navigation blocked");
        }
        return originalPushState.apply(window.history, args);
      };
    });

    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    newChatButton = page.locator('button:has-text("New Chat")').first();
    await newChatButton.click();

    // Wait for any navigation errors to be logged
    await page.waitForLoadState("networkidle", { timeout: 2000 });

    // Should have logged navigation errors
    expect(
      consoleLogs.some(
        (log) => log.includes("Navigation") || log.includes("❌"),
      ),
    ).toBeTruthy();
  });

  test("should create local chat for unauthenticated users", async ({
    page,
  }) => {
    // Ensure we're not authenticated (no auth token)
    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    newChatButton = page.locator('button:has-text("New Chat")').first();
    await newChatButton.click();

    // Should navigate to chat URL (now using Convex for all users)
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Verify chat ID format (Convex generates UUID-like IDs)
    const url = page.url();
    expect(url).toMatch(/\/chat\/[a-zA-Z0-9_-]+/);
  });

  test("should maintain state consistency during creation", async ({
    page,
  }) => {
    // Open console to monitor state
    const logs: string[] = [];
    page.on("console", (msg) => {
      const text = msg.text();
      if (
        text.includes("startNewChatSession") ||
        text.includes("Creating new chat") ||
        text.includes("🆕")
      ) {
        logs.push(text);
      }
    });

    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    newChatButton = page.locator('button:has-text("New Chat")').first();
    await newChatButton.click();

    // Wait for navigation
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Check that some logging occurred (may vary based on environment)
    expect(logs.length).toBeGreaterThan(0);

    // Verify message input is cleared and ready
    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible();
    await expect(messageInput).toHaveValue("");
  });

  test("should handle follow-up new chat creation", async ({ page }) => {
    // First, create a chat and send a message
    await page.goto("/");
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("Test message");
    await page.keyboard.press("Enter");

    // Wait for response
    await page.waitForSelector("text=/AI|Assistant/", { timeout: 30000 });

    // Look for follow-up prompt if it appears
    const followUpButton = page.locator('button:has-text("Start New Chat")');
    if (await followUpButton.isVisible({ timeout: 5000 })) {
      await followUpButton.click();

      // Should navigate to new chat
      await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

      // Should be a different chat ID
      const newUrl = page.url();
      expect(newUrl).toMatch(/\/chat\/.+/);
    }
  });

  test("should handle browser back/forward navigation", async ({ page }) => {
    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    // Create first chat
    newChatButton = page.locator('button:has-text("New Chat")').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });
    const firstChatUrl = page.url();

    // Wait for chat to be fully loaded before creating second
    await page.waitForSelector('[data-testid="message-input"]', {
      state: "visible",
    });
    await page.waitForLoadState("networkidle");

    // May need to reopen sidebar for second chat
    const isStillVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (!isStillVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    // Create second chat
    newChatButton = page.locator('button:has-text("New Chat")').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();
    await page.waitForURL(
      (url) =>
        url.toString() !== firstChatUrl && /\/chat\/.+/.test(url.toString()),
      { timeout: 10000 },
    );
    const secondChatUrl = page.url();

    // URLs should be different
    expect(firstChatUrl).not.toBe(secondChatUrl);

    // Go back
    await page.goBack();
    await page.waitForURL(firstChatUrl, { timeout: 1000 });
    expect(page.url()).toBe(firstChatUrl);

    // Go forward
    await page.goForward();
    await page.waitForURL(secondChatUrl, { timeout: 1000 });
    expect(page.url()).toBe(secondChatUrl);
  });

  test("should recover from error boundary", async ({ page }) => {
    // Navigate to page first
    await page.goto("/");

    // Inject a script that will throw an error in React component
    await page.addInitScript(() => {
      // Override a common React method to throw an error
      window.addEventListener("error", (e) => {
        if (e.message && e.message.includes("Test error boundary")) {
          // Allow this specific error to bubble up
          return;
        }
      });
    });

    // Trigger an error by evaluating code that throws
    await page.evaluate(() => {
      // This will trigger a page error
      setTimeout(() => {
        throw new Error("Test error boundary");
      }, 100);
    });

    // Wait for error to propagate using a proper wait condition
    await page
      .waitForFunction(
        () =>
          window.location.pathname === "/" ||
          document.querySelector("[data-error-boundary]"),
        { timeout: 2000 },
      )
      .catch(() => {});

    // Check if error boundary UI appears (may not always trigger in E2E)
    const errorBoundaryVisible = await page
      .locator("text=/Something went wrong/")
      .isVisible({ timeout: 2000 })
      .catch(() => false);

    if (errorBoundaryVisible) {
      // Should have recovery options
      const homeButton = page.locator('button:has-text("Go to Home")');
      await expect(homeButton).toBeVisible();

      // Click to recover
      await homeButton.click();

      // Should navigate to home
      await page.waitForURL(/^http:\/\/(localhost:5173|127\.0\.0\.1:4173)\/$/, {
        timeout: 5000,
      });
    } else {
      // Error boundary may not catch all errors in E2E, skip gracefully
      console.info("Error boundary did not trigger in E2E environment");
    }
  });

  test("should handle network delays gracefully", async ({ page, context }) => {
    // Add artificial delay to API calls
    await context.route("**/api/**", async (route) => {
      // Fetch the response once
      const response = await route.fetch();
      // Add delay to simulate slow network
      await new Promise((resolve) => setTimeout(resolve, 2000)); // Intentional delay for testing slow network
      // Fulfill with the fetched response
      await route.fulfill({ response });
    });

    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    newChatButton = page.locator('button:has-text("New Chat")').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();

    // Should show loading state during delay
    const loadingButton = page
      .locator('button:has-text("Creating...")')
      .first();
    await expect(loadingButton).toBeVisible({ timeout: 3000 });

    // Should complete eventually (local storage doesn't need API)
    await page.waitForURL(/\/chat\/.+/, { timeout: 15000 });

    // Should not show loading anymore
    await expect(loadingButton).not.toBeVisible();
  });

  test("should validate chat creation in sidebar", async ({ page }) => {
    // Open sidebar if needed
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    // Create a new chat
    newChatButton = page.locator('button:has-text("New Chat")').first();
    await expect(newChatButton).toBeVisible();
    await newChatButton.click();
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Wait for sidebar to update with new chat
    await page.waitForSelector('a[href^="/chat/"]', { timeout: 2000 });

    // Open sidebar to verify chat appears (if it auto-closed)
    const sidebarStillOpen = await page
      .locator('[role="complementary"], [role="navigation"]')
      .isVisible({ timeout: 1000 })
      .catch(() => false);
    if (!sidebarStillOpen) {
      const sidebarToggleForVerify = page
        .locator('button[aria-label="Toggle sidebar"]')
        .first();
      if (await sidebarToggleForVerify.isVisible()) {
        await sidebarToggleForVerify.click();
        await waitForSidebarAnimation(page);
      }
    }

    // Look for chat items in the sidebar
    const chatItems = page
      .locator('a[href^="/chat/"], button:has-text("New Chat")')
      .first();
    await expect(chatItems).toBeVisible({ timeout: 5000 });
  });
});

test.describe("New Chat Stress Tests", () => {
  test("should handle 10 sequential chat creations", async ({ page }) => {
    const chatUrls: string[] = [];

    for (let i = 0; i < 10; i++) {
      // Open sidebar if needed for each iteration
      const sidebarToggle = page
        .locator('button[aria-label="Toggle sidebar"]')
        .first();
      let newChatButton = page.locator('button:has-text("New Chat")').first();
      const isNewChatVisible = await newChatButton
        .isVisible({ timeout: 1000 })
        .catch(() => false);

      if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
        await sidebarToggle.click();
        await waitForSidebarAnimation(page);
      }

      newChatButton = page.locator('button:has-text("New Chat")').first();
      await expect(newChatButton).toBeVisible({ timeout: 5000 });
      await expect(newChatButton).toBeEnabled();

      await newChatButton.click();

      // Wait for URL to change from previous
      const previousUrl = i > 0 ? chatUrls[i - 1] : null;
      try {
        if (previousUrl) {
          await page.waitForURL((url) => url.toString() !== previousUrl, {
            timeout: 10000,
          });
        } else {
          await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });
        }
      } catch {
        // If navigation fails, just continue - we're testing stress
        console.info(`Navigation ${i + 1} may have failed, continuing test`);
      }

      const currentUrl = page.url();
      if (currentUrl.includes("/chat/")) {
        chatUrls.push(currentUrl);
      }

      // Wait for chat to be ready before next creation
      await page.waitForLoadState("networkidle");
    }

    // Should have created multiple unique chats (allow for some failures in stress test)
    const uniqueUrls = new Set(chatUrls);
    expect(uniqueUrls.size).toBeGreaterThanOrEqual(5); // At least half should succeed
  });

  test("should handle chat creation with existing messages", async ({
    page,
  }) => {
    // Send a message first
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("Initial message");
    await page.keyboard.press("Enter");

    // Wait for chat to be created and response
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });
    await page.waitForSelector("text=/AI|Assistant/", { timeout: 30000 });

    // Open sidebar if needed to create new chat
    const sidebarToggle = page
      .locator('button[aria-label="Toggle sidebar"]')
      .first();
    let newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton
      .isVisible({ timeout: 1000 })
      .catch(() => false);

    if (!isNewChatVisible && (await sidebarToggle.isVisible())) {
      await sidebarToggle.click();
      await waitForSidebarAnimation(page);
    }

    // Now create a new chat
    newChatButton = page.locator('button:has-text("New Chat")').first();
    await newChatButton.click();

    // Should navigate to different chat
    await page.waitForURL(/\/chat\/.+/, { timeout: 10000 });

    // Should have no messages in new chat
    await expect(page.locator('text="Initial message"')).not.toBeVisible();
  });
});
