/**
 * E2E tests for New Chat functionality (basic flows)
 */

import { test, expect } from "@playwright/test";
import { viewports } from "../config/viewports";
import { setupNewChatPage } from "../helpers/new-chat";
import { getNewChatButton, createNewChat } from "../helpers/sidebar-helpers";

test.describe("New Chat Basics", () => {
  test.beforeEach(async ({ page }) => {
    await setupNewChatPage(page);
  });

  test("should create new chat when clicking New Chat button", async ({ page }) => {
    const newChatButton = await getNewChatButton(page);
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await expect(newChatButton).toBeEnabled();

    const initialUrl = page.url();
    const initialMatch = initialUrl.match(/\/(chat|p|s)\/([^/?]+)/);
    const initialChatId = initialMatch ? initialMatch[2] : null;

    const newChatId = await createNewChat(page);
    expect(newChatId).toBeTruthy();

    if (initialChatId) {
      expect(newChatId).not.toBe(initialChatId);
    }

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(chat|p|s)\/[^/]+/);
    expect(currentUrl).toContain(newChatId);

    const messageInput = page.locator('textarea, [role="textbox"]').first();
    await expect(messageInput).toBeVisible({ timeout: 5000 });
    await expect(messageInput).toBeEnabled();

    const creatingButtons = await page.locator('button:has-text("Creating...")').count();
    expect(creatingButtons).toBe(0);

    const newButton = await getNewChatButton(page);
    await expect(newButton).toBeEnabled();
  });

  test("should prevent multiple simultaneous chat creations", async ({ page }) => {
    const newChatButton = await getNewChatButton(page);
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    const clickPromises = [];
    for (let i = 0; i < 5; i++) {
      clickPromises.push(newChatButton.click({ force: true, noWaitAfter: true }));
    }

    await Promise.all(clickPromises);

    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });

    const currentUrl = page.url();
    expect(currentUrl).toMatch(/\/(chat)\/.+/);

    await expect(newChatButton).toBeEnabled();
  });

  test("should create chat from mobile sidebar", async ({ page }) => {
    await page.setViewportSize(viewports.iPhoneSE);

    const newChatButton = await getNewChatButton(page);
    await expect(newChatButton).toBeVisible({ timeout: 5000 });

    await newChatButton.click();

    try {
      await expect(page.locator('button:has-text("Creating...")').first()).toBeVisible({
        timeout: 1000,
      });
    } catch {
      // Ignore timeout
    }

    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });

    await expect(page.locator('[role="dialog"]')).not.toBeVisible();
  });

  test("should create local chat for unauthenticated users", async ({ page, browserName }) => {
    test.skip(browserName === "firefox", "Unauth chat creation flaky on Firefox");

    await page.evaluate(() => {
      localStorage.clear();
      sessionStorage.clear();
    });

    await page.reload();
    await page.waitForLoadState("networkidle");

    const newChatButton = await getNewChatButton(page);
    await newChatButton.click();

    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });

    const url = page.url();
    expect(url).toMatch(/\/(chat)\/.+/);
  });

  test("should handle follow-up new chat creation", async ({ page }) => {
    await page.goto("/", { waitUntil: "domcontentloaded" });
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.fill("Test message");
    await page.keyboard.press("Enter");

    await expect(page.locator('[data-testid="message-assistant"]').first()).toBeVisible({
      timeout: 30000,
    });

    const followUpButton = page.locator('button:has-text("Start New Chat")');
    if (await followUpButton.isVisible({ timeout: 5000 })) {
      await followUpButton.click();
      await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });
      const newUrl = page.url();
      expect(newUrl).toMatch(/\/(chat)\/.+/);
    }
  });

  test("should validate chat creation in sidebar", async ({ page }) => {
    const newChatButton = await getNewChatButton(page);
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
    await newChatButton.click();
    await page.waitForURL(/\/(chat)\/.+/, { timeout: 10000 });

    const isStillOpen = await newChatButton.isVisible({ timeout: 1000 }).catch(() => false);

    if (!isStillOpen) {
      const sidebarToggle = page.locator('button[aria-label="Toggle sidebar"]').first();
      if (await sidebarToggle.isVisible().catch(() => false)) {
        await sidebarToggle.click();
      }
    }

    const chatOrNewButton = page
      .locator('button:has-text("New Chat"), button[data-chat-id]')
      .first();
    await expect(chatOrNewButton).toBeVisible({ timeout: 5000 });
  });
});
