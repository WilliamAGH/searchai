/**
 * Test helper utilities for proper wait conditions
 * Replaces arbitrary timeouts with proper Playwright wait conditions
 */

import type { Page } from "@playwright/test";

/**
 * Wait for network idle state
 */
export async function waitForNetworkIdle(page: Page) {
  await page.waitForLoadState("networkidle", { timeout: 5000 });
}
