import { test, expect } from "@playwright/test";

test.describe("smoke: share modal link variants", () => {
  test("smoke: shared/public/llm show correct URL shapes", async ({ page }) => {
    // Go home
    await page.goto("/");

    // Type to create a local chat quickly
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.click();
    await input.type("Hello world");
    // Open share modal via keyboard shortcut or button near input
    // Fallback: find any button with "Share" text
    const shareButton = page.locator('button:has-text("Share")').first();
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    // Expect modal
    const modal = page.getByRole("dialog", { name: /share/i });
    await expect(modal).toBeVisible();

    // Select Shared option
    const sharedRadio = modal.locator('input[type="radio"][value="shared"]');
    await sharedRadio.check();

    // URL box should contain /s/
    const urlInput = modal.locator("#share-url-input");
    await expect(urlInput).toBeVisible();
    await expect(urlInput).toHaveValue(/\/s\//);

    // Select Public
    const publicRadio = modal.locator('input[type="radio"][value="public"]');
    await publicRadio.check();
    await expect(urlInput).toHaveValue(/\/p\//);

    // Select LLM (4th)
    const llmRadio = modal.locator('input[type="radio"][value="llm"]');
    await llmRadio.check();
    await expect(urlInput).toHaveValue(/\/api\/chatTextMarkdown\?shareId=/);

    // Copy triggers share+publish; ensure button is enabled and clickable
    const copyBtn = modal.locator("button", { hasText: /copy/i });
    await expect(copyBtn).toBeEnabled();
    await copyBtn.click();

    // Fetch the URL directly via Playwright's API client if we're running with the proxy runtime
    const llmUrl = await urlInput.inputValue();
    if (process.env.PLAYWRIGHT_RUNTIME === "proxy") {
      const resp = await page.request.get(llmUrl);
      expect(resp.status()).toBe(200);
      const ct = resp.headers()["content-type"] || "";
      expect(ct).toContain("text/plain");
      const body = await resp.text();
      expect(typeof body).toBe("string");
    }
  });
});
