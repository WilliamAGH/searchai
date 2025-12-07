/**
 * Debug test for mobile sidebar issue
 */

import { test, expect } from "@playwright/test";

test.describe("Debug Mobile Sidebar", () => {
  test("check mobile sidebar rendering", async ({ page }) => {
    // Capture errors
    const errors: string[] = [];
    page.on("pageerror", (exception) => {
      errors.push(`Page error: ${exception.message}\n${exception.stack}`);
    });

    page.on("console", (msg) => {
      if (msg.type() === "error") {
        errors.push(`Console error: ${msg.text()}`);
      }
    });

    // Set mobile viewport
    await page.setViewportSize({ width: 375, height: 667 });

    // Go to home
    await page.goto("/");
    await page.waitForLoadState("networkidle");

    // Log initial state
    console.log("Checking for toggle button...");

    // Find the toggle button
    const toggleButton = page.locator('button[aria-label="Toggle sidebar"]');
    await expect(toggleButton).toBeVisible({ timeout: 5000 });

    // Check if button is actually clickable
    const isEnabled = await toggleButton.isEnabled();
    console.log("Toggle button enabled:", isEnabled);

    // Get initial sidebar state
    const dialogBefore = await page.locator('[role="dialog"]').count();
    console.log("Dialogs before click:", dialogBefore);

    // Add listener for console logs
    page.on("console", (msg) => {
      if (msg.type() === "log" || msg.type() === "info") {
        console.log("Browser console:", msg.text());
      }
    });

    // Click the toggle button
    console.log("Clicking toggle button...");
    await toggleButton.click();

    // Wait a bit for any animations
    await page.waitForTimeout(1000);

    // Check for dialog after click
    const dialogAfter = await page.locator('[role="dialog"]').count();
    console.log("Dialogs after click:", dialogAfter);

    // Check for any mobile sidebar class
    const mobileSidebar = await page.locator(".mobile-sidebar-dialog").count();
    console.log("Mobile sidebar dialogs:", mobileSidebar);

    // Check if Transition component is rendering
    const transitionElements = await page
      .locator("[data-headlessui-state]")
      .count();
    console.log("Headless UI transition elements:", transitionElements);

    // Check the actual sidebar open state (captured for debugging, console.log is commented out)
    const _sidebarState = await page.evaluate(() => {
      // Try to find React fiber to check state
      const button = document.querySelector(
        'button[aria-label="Toggle sidebar"]',
      );
      if (!button) return { found: false };

      const reactKey = Object.keys(button).find(
        (key) =>
          key.startsWith("__reactFiber") ||
          key.startsWith("__reactInternalInstance"),
      );

      if (!reactKey) return { found: false, hasReact: false };

      // Navigate up to find the state
      let fiber = (button as any)[reactKey];
      let depth = 0;

      while (fiber && depth < 20) {
        if (fiber.memoizedState) {
          // console.log(`State at depth ${depth}:`, fiber.memoizedState);
        }
        fiber = fiber.return;
        depth++;
      }

      return { found: true, hasReact: true, depth };
    });

    // console.log("Sidebar state check:", sidebarState);

    // Print any errors captured
    if (errors.length > 0) {
      console.log("Errors captured:");
      errors.forEach((err) => console.log(err));
    }

    // Check if error boundary is showing
    const errorBoundary = await page
      .locator("text=/Something went wrong/i")
      .count();
    if (errorBoundary > 0) {
      console.log("Error boundary is showing!");

      // Try to get error details
      const errorDetails = await page
        .locator("details")
        .first()
        .textContent()
        .catch(() => null);
      if (errorDetails) {
        console.log("Error details:", errorDetails);
      }
    }

    // Final check - should have a dialog visible
    // Check for nav inside the dialog (more reliable than checking dialog container)
    const nav = page.locator('[role="dialog"] nav').first();
    await expect(nav).toBeVisible({
      timeout: 5000,
    });
  });
});
