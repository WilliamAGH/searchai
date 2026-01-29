/**
 * Helper functions for sidebar interactions in E2E tests
 */

import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";

/**
 * Ensures the sidebar is open and visible
 * Works for both desktop and mobile viewports
 */
export async function ensureSidebarOpen(page: Page): Promise<void> {
  // Check if we're on mobile (viewport width < 1024px)
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 1024;

  if (isMobile) {
    // Mobile: Look for sidebar toggle button (same as desktop but opens modal)
    const menuButton = page.locator('button[aria-label="Toggle sidebar"]').first();
    const isMenuVisible = await menuButton.isVisible().catch(() => false);

    if (isMenuVisible) {
      await menuButton.click();
      // Wait for mobile sidebar dialog panel to appear (the actual content, not the container)
      // HeadlessUI Dialog container might be hidden while the panel inside is visible
      const dialogPanel = page
        .locator('[role="dialog"].mobile-sidebar-dialog [role="dialog"]')
        .first();

      // First try to find the panel, if not found, try the container
      const panelExists = await dialogPanel.count().catch(() => 0);
      const dialogToCheck =
        panelExists > 0
          ? dialogPanel
          : page.locator('[role="dialog"].mobile-sidebar-dialog').first();

      // Wait for it to be attached
      await dialogToCheck.waitFor({ state: "attached", timeout: 2000 });

      // Wait for transition to complete - check for New Chat button which is inside the panel
      await page.waitForFunction(
        () => {
          // Check if New Chat button is visible (inside the dialog)
          // Find all buttons in dialogs and check their text content
          const buttons = document.querySelectorAll('[role="dialog"] button');
          for (const btn of buttons) {
            const text = btn.textContent || "";
            if (text.includes("New Chat")) {
              const style = window.getComputedStyle(btn);
              return style.display !== "none" && style.visibility !== "hidden";
            }
          }
          return false;
        },
        { timeout: 5000 },
      );

      // Verify New Chat button is visible (this confirms the dialog is open)
      const newChatButton = page.locator('[role="dialog"] button:has-text("New Chat")').first();
      await expect(newChatButton).toBeVisible({ timeout: 3000 });
    }
  } else {
    // Desktop: Check if sidebar is already visible
    const newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton.isVisible({ timeout: 500 }).catch(() => false);

    if (!isNewChatVisible) {
      // Try to find and click the sidebar toggle
      const sidebarToggle = page.locator('button[aria-label="Toggle sidebar"]').first();
      const isToggleVisible = await sidebarToggle.isVisible().catch(() => false);

      if (isToggleVisible) {
        await sidebarToggle.click();
        // Wait for sidebar animation
        await page.waitForTimeout(300);
      }
    }

    // Verify the New Chat button is now visible
    await expect(newChatButton).toBeVisible({ timeout: 5000 });
  }
}

/**
 * Closes the sidebar if it's open
 */
export async function closeSidebar(page: Page): Promise<void> {
  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 1024;

  if (isMobile) {
    // Mobile: Close dialog if present
    const dialog = page.locator('[role="dialog"]').first();
    const isDialogVisible = await dialog.isVisible().catch(() => false);

    if (isDialogVisible) {
      // Click overlay or close button
      const overlay = page.locator('[role="dialog"] ~ div[class*="overlay"]').first();
      const closeButton = page.locator('[role="dialog"] button[aria-label="Close"]').first();

      if (await closeButton.isVisible().catch(() => false)) {
        await closeButton.click();
      } else if (await overlay.isVisible().catch(() => false)) {
        await overlay.click();
      }

      // Wait for dialog to disappear
      await expect(dialog).not.toBeVisible({ timeout: 3000 });
    }
  } else {
    // Desktop: Check if sidebar is visible
    const newChatButton = page.locator('button:has-text("New Chat")').first();
    const isNewChatVisible = await newChatButton.isVisible({ timeout: 500 }).catch(() => false);

    if (isNewChatVisible) {
      const sidebarToggle = page.locator('button[aria-label="Toggle sidebar"]').first();
      if (await sidebarToggle.isVisible().catch(() => false)) {
        await sidebarToggle.click();
        await page.waitForTimeout(300);
        // Verify it's closed
        await expect(newChatButton).not.toBeVisible({ timeout: 3000 });
      }
    }
  }
}

/**
 * Gets the New Chat button, ensuring sidebar is open first
 */
export async function getNewChatButton(page: Page) {
  await ensureSidebarOpen(page);

  const viewport = page.viewportSize();
  const isMobile = viewport && viewport.width < 1024;

  if (isMobile) {
    // In mobile dialog
    return page.locator('[role="dialog"] button:has-text("New Chat")').first();
  } else {
    // In desktop sidebar
    return page.locator('button:has-text("New Chat")').first();
  }
}

/**
 * Clicks the New Chat button and waits for navigation
 */
export async function createNewChat(page: Page): Promise<string> {
  // Get initial URL to check if we're already on a chat
  const initialUrl = page.url();
  const initialMatch = initialUrl.match(/\/(chat|p|s)\/([^/?]+)/);
  const initialChatId = initialMatch ? initialMatch[2] : null;

  const button = await getNewChatButton(page);
  await expect(button).toBeVisible({ timeout: 5000 });

  // Click the button
  await button.click();

  // Wait for loading state if it appears
  const loadingVisible = await page
    .locator('button:has-text("Creating...")')
    .first()
    .isVisible({ timeout: 500 })
    .catch(() => false);

  if (loadingVisible) {
    await expect(page.locator('button:has-text("Creating...")').first()).not.toBeVisible({
      timeout: 10000,
    });
  }

  // Wait for URL to change to a different chat
  if (initialChatId) {
    // We were on a chat, wait for a different chat ID
    await page.waitForFunction(
      (currentId) => {
        const url = window.location.href;
        const match = url.match(/\/(chat|p|s)\/([^/?]+)/);
        return match && match[2] !== currentId;
      },
      initialChatId,
      { timeout: 15000 },
    );
  } else {
    // We weren't on a chat, wait for any chat URL
    await page.waitForURL(/\/(chat|p|s)\/[^/]+/, { timeout: 15000 });
  }

  // Return the new chat ID from URL
  const newUrl = page.url();
  const match = newUrl.match(/\/(chat|p|s)\/([^/?]+)/);
  return match ? match[2] : "";
}
