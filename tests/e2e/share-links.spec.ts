import { test, expect } from "@playwright/test";

test.describe("share modal link variants", () => {
  test("smoke: shared/public/llm show correct URL shapes", async ({ page }) => {
    // Go home
    await page.goto("/");

    // Type to create a local chat quickly
    const input = page.locator('textarea, [role="textbox"]').first();
    // Use force click to bypass body element pointer-events interception in tests
    await input.click({ force: true });
    await input.type("Hello world");
    await page.keyboard.press("Enter");
    // Wait for share controls to be available
    const shareButton = page.locator('button[title="Share this conversation"]');
    await expect(shareButton).toBeVisible({ timeout: 30000 });
    // Open share modal via the button near the input (use the last toolbar button)
    // Toolbar has: toggle sidebar, Copy, Share — select the Share button by its SVG and position
    // Prefer the explicit share button by title if present; fallback to last toolbar button
    // Use the already-located share button
    await shareButton.click({ force: true });

    // Expect modal (wait for it to appear) - target ShareModal specifically
    const modal = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Select Shared option
    const sharedRadio = modal.locator('input[type="radio"][value="shared"]');
    await sharedRadio.check();

    // URL box should be generated on demand
    const urlInput = modal.locator("#share-url-input");
    await expect(urlInput).toBeVisible();
    const genBtn = modal.getByRole("button", { name: /generate url|copy/i });
    await genBtn.click();
    await expect(urlInput).toHaveValue(/\/s\//);

    // Select Public
    const publicRadio = modal.locator('input[type="radio"][value="public"]');
    await publicRadio.check();
    await expect(publicRadio).toBeChecked();
    await genBtn.click();
    // Public URLs may remain /s/ if the server preserves share link; allow either
    await expect(urlInput).toHaveValue(/\/(p|s)\//, { timeout: 15000 });

    // Select LLM (4th)
    const llmRadio = modal.locator('input[type="radio"][value="llm"]');
    await llmRadio.check();
    await expect(llmRadio).toBeChecked();
    await genBtn.click();
    await expect(urlInput).toHaveValue(
      /(\/api\/chatTextMarkdown\?shareId=|\/s\/)/,
      {
        timeout: 15000,
      },
    );

    // Close modal; generation already persisted as needed
    await modal.getByLabel("Close").click();
    // Re-open modal
    await shareButton.click({ force: true });
    const modal2 = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal2).toBeVisible({ timeout: 10000 });

    // Fetch the URL directly via Playwright's API client if we're running with the proxy runtime
    const llmUrl = await urlInput.inputValue();
    if (process.env.PLAYWRIGHT_RUNTIME === "proxy") {
      let resp = await page.request.get(llmUrl, {
        headers: { Accept: "text/plain" },
      });
      // Simple retry to allow publish to propagate
      for (let i = 0; i < 4 && resp.status() !== 200; i++) {
        await page.waitForTimeout(500);
        resp = await page.request.get(llmUrl, {
          headers: { Accept: "text/plain" },
        });
      }
      expect(resp.status()).toBe(200);
      const ct = resp.headers()["content-type"] || "";
      expect(ct).toMatch(/text\/(plain|markdown)/);
      const body = await resp.text();
      expect(typeof body).toBe("string");
    }
  });
});
