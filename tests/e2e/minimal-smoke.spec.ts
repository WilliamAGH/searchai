import { test, expect } from "@playwright/test";

// Minimal smoke test that can pass without backend
test("smoke: application builds and serves", async ({ page }) => {
  // Simply verify the app loads and renders basic structure
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

  // Check that the page has loaded with expected title
  await expect(page).toHaveTitle(/SearchAI|search|AI/i, { timeout: 5000 });

  // Verify basic UI structure is present
  const body = page.locator("body");
  await expect(body).toBeVisible({ timeout: 5000 });

  // Check for main app container
  const app = page
    .locator("#root, #app, [data-testid='app'], .app, main")
    .first();
  await expect(app).toBeVisible({ timeout: 5000 });
});

test("smoke: basic UI elements render", async ({ page }) => {
  await page.goto("/", { waitUntil: "domcontentloaded", timeout: 10000 });

  // Check for either input or welcome message
  const hasInput = await page
    .locator('textarea, input[type="text"], [role="textbox"]')
    .first()
    .isVisible()
    .catch(() => false);

  const hasWelcome = await page
    .locator("text=/welcome|hello|start|chat/i")
    .first()
    .isVisible()
    .catch(() => false);

  // At least one should be present
  expect(hasInput || hasWelcome).toBeTruthy();
});
