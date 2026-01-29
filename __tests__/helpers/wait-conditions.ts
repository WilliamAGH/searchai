/**
 * Test helper utilities for proper wait conditions
 * Replaces arbitrary timeouts with proper Playwright wait conditions
 */

import { Page, Locator } from "@playwright/test";

/**
 * Wait for sidebar animation to complete
 */
export async function waitForSidebarAnimation(page: Page) {
  // Wait for the sidebar dialog to be stable (animation complete)
  const sidebar = page.locator('[role="dialog"], [data-sidebar], .sidebar-dialog').first();

  try {
    // First wait for it to be visible
    await sidebar.waitFor({ state: "visible", timeout: 1000 }).catch(() => {});

    // Then wait for animation to complete using a more reliable method
    await page.waitForFunction(
      () => {
        const sidebar = document.querySelector('[role="dialog"], [data-sidebar], .sidebar-dialog');
        if (!sidebar) return true;

        // Check if any transitions are still running
        const computedStyle = window.getComputedStyle(sidebar);
        const transform = computedStyle.transform;
        const opacity = computedStyle.opacity;

        // Most sidebars animate via transform or opacity
        return transform === "none" || transform === "matrix(1, 0, 0, 1, 0, 0)" || opacity === "1";
      },
      { timeout: 1000 },
    );
  } catch {
    // If waiting fails, just continue - sidebar might not be animating
  }
}

/**
 * Wait for chat list to load
 */
export async function waitForChatList(page: Page) {
  await page.waitForSelector("[data-chat-list-loaded]", { timeout: 5000 });
}

/**
 * Wait for message to appear in chat
 */
export async function waitForMessage(page: Page, text: string) {
  await page.waitForSelector(`text="${text}"`, { timeout: 10000 });
}

/**
 * Wait for network idle state
 */
export async function waitForNetworkIdle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 });
}

/**
 * Wait for element to be stable (not moving/animating)
 */
export async function waitForElementStable(locator: Locator) {
  await locator.waitFor({ state: "visible" });

  // Wait for element position to stabilize
  await locator.evaluate((el) => {
    return new Promise<void>((resolve) => {
      let lastPos = el.getBoundingClientRect();
      let checks = 0;

      const checkStable = () => {
        const currentPos = el.getBoundingClientRect();
        if (
          lastPos.x === currentPos.x &&
          lastPos.y === currentPos.y &&
          lastPos.width === currentPos.width &&
          lastPos.height === currentPos.height
        ) {
          checks++;
          if (checks >= 2) {
            resolve();
            return;
          }
        } else {
          checks = 0;
        }
        lastPos = currentPos;

        if (checks < 10) {
          requestAnimationFrame(checkStable);
        } else {
          resolve(); // Timeout after 10 frames
        }
      };

      checkStable();
    });
  });
}

/**
 * Wait for router navigation to complete
 */
export async function waitForNavigation(page: Page, url: string | RegExp) {
  await page.waitForURL(url, { timeout: 5000 });
  await page.waitForLoadState("domcontentloaded");
}

/**
 * Wait for form submission to complete
 */
export async function waitForFormSubmission(page: Page) {
  await Promise.race([
    page.waitForLoadState("networkidle"),
    page.waitForSelector("[data-form-success]", { timeout: 5000 }),
    page.waitForSelector("[data-form-error]", { timeout: 5000 }),
  ]);
}

/**
 * Wait for React component to mount
 */
export async function waitForReactMount(page: Page, selector: string) {
  await page.waitForFunction(
    (sel) => {
      const element = document.querySelector(sel);
      return element && element.getAttribute("data-react-mounted") === "true";
    },
    selector,
    { timeout: 3000 },
  );
}

/**
 * Wait for debounced input
 */
export async function waitForDebouncedInput(page: Page, inputSelector: string) {
  await page.waitForFunction(
    (selector) => {
      const input = document.querySelector(selector) as HTMLInputElement;
      if (!input) return false;

      // Check if input has a data attribute indicating debounce is complete
      return input.getAttribute("data-debounce-complete") === "true";
    },
    inputSelector,
    { timeout: 2000 },
  );
}
