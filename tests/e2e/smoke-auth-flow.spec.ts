import { test, expect } from "@playwright/test";
import { MOCK_USER_A } from "../helpers/users";

test.describe("Authentication Flow", () => {
  test("smoke: sign-in modal opens and accepts input", async ({ page }) => {
    // Navigate to home
    await page.goto("/");

    // Expect app header present
    await expect(page.getByRole("heading", { name: /SearchAI/i })).toBeVisible({
      timeout: 15000,
    });

    // Open sign-in modal from header
    const signInBtn = page.getByRole("button", { name: /sign in/i });
    await expect(signInBtn).toBeVisible();
    await signInBtn.click();

    // Modal should appear
    await expect(
      page.getByRole("heading", { name: /Sign In to SearchAI/i }),
    ).toBeVisible();

    // Fill credentials (backend may reject — this is a smoke test for UI only)
    const email = page.getByPlaceholder("Email");
    const password = page.getByPlaceholder("Password");
    await expect(email).toBeVisible();
    await expect(password).toBeVisible();
    await email.fill(MOCK_USER_A.email);
    await password.fill(MOCK_USER_A.password);

    // Submit
    await page.getByRole("button", { name: /^sign in$/i }).click();

    // Either modal closes or remains (auth depends on environment). Close if still open.
    const closeBtn = page.getByLabel("Close sign in modal");
    if (await closeBtn.isVisible().catch(() => false)) {
      await closeBtn.click();
    }

    // Back at main app
    await expect(page.getByRole("heading", { name: /SearchAI/i })).toBeVisible();
  });
});
