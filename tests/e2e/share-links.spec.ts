import { test, expect } from "@playwright/test";

test.describe("share modal link variants", () => {
  test("smoke: shared/public/llm show correct URL shapes", async ({ page }) => {
    // Go home
    await page.goto("/");

    // Type to create a local chat quickly
    const input = page.locator('textarea, [role="textbox"]').first();
    await input.click();
    await input.type("Hello world");
    // Open share modal via the button near the input (use the last toolbar button)
    // Toolbar has: toggle sidebar, Copy, Share — select the Share button by its SVG and position
    // Prefer the explicit share button by title if present; fallback to last toolbar button
    const byTitle = page.locator('button[title="Share this conversation"]');
    const shareButton = (await byTitle.count()) > 0 ? byTitle : page.locator('button').filter({ has: page.locator('svg') }).last();
    await expect(shareButton).toBeVisible();
    await shareButton.click();

    // Expect modal (wait for it to appear)
    const modal = page.locator('[role="dialog"][aria-modal="true"]');
    await expect(modal).toBeVisible({ timeout: 10000 });

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
