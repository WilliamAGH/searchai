import { test, expect } from "@playwright/test";
import { VITE_CONVEX_URL } from "../helpers/env";
import { MOCK_USER_A, MOCK_USER_B } from "../helpers/users";

test.describe("Authentication Flow", () => {
  test("should allow a user to log in, access a protected page, and log out", async ({
    page,
  }) => {
    // 1. Navigate to the login page
    await page.goto("/");
    await expect(
      page.getByRole("button", { name: "Get Started" }),
    ).toBeVisible();

    // 2. Log in with valid credentials
    await page.getByRole("button", { name: "Get Started" }).click();
    await page.waitForURL("https://dev-m8k25flm.us.auth0.com/**");
    await page.getByLabel("Email address").fill(MOCK_USER_A.email);
    await page.getByLabel("Password").fill(MOCK_USER_A.password);
    await page.getByRole("button", { name: "Continue" }).click();
    await page.waitForURL("/");

    // 3. Verify that the user is redirected to the main application page
    await expect(page.getByRole("heading", { name: "SearchAI" })).toBeVisible();

    // 4. Verify that the user's information is displayed correctly
    await expect(page.getByText(MOCK_USER_A.name)).toBeVisible();

    // 5. Navigate to a protected route (e.g., settings)
    await page.getByRole("button", { name: "Settings" }).click();
    await expect(page.getByRole("heading", { name: "Settings" })).toBeVisible();

    // 6. Verify that the user can access the protected route
    await expect(page.getByText("User Preferences")).toBeVisible();

    // 7. Log out
    await page.getByRole("button", { name: "Logout" }).click();

    // 8. Verify that the user is redirected to the login page
    await expect(
      page.getByRole("button", { name: "Get Started" }),
    ).toBeVisible();

    // 9. Attempt to navigate to the protected route again
    await page.goto("/settings");

    // 10. Verify that the user is redirected to the login page
    await expect(
      page.getByRole("button", { name: "Get Started" }),
    ).toBeVisible();
  });
});
