import { test, expect } from "@playwright/test";

test.describe("smoke: existing shared/public chat open has no console errors", () => {
  test("smoke: publish shared chat anonymously then open share URL", async ({
    page,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];
    const responseFailures: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const t = msg.text() || "";
      if (/Failed to navigate to new (local )?chat:/i.test(t)) return;
      consoleErrors.push(t);
    });
    page.on("pageerror", (err) => consoleErrors.push(err.message));
    const isHttp = (u: string) =>
      u.startsWith("http://") || u.startsWith("https://");
    page.on("requestfailed", (req) => {
      const url = req.url();
      if (!isHttp(url)) return;
      if (url.endsWith("favicon.ico") || url.endsWith("favicon.svg")) return;
      // Allow aborted background calls during navigation/render
      const err = req.failure()?.errorText || "";
      if (/aborted/i.test(err)) return;
      requestFailures.push(`${req.method()} ${url} -> ${err}`);
    });
    page.on("response", (res) => {
      const url = res.url();
      if (!isHttp(url)) return;
      const status = res.status();
      if (status >= 400)
        responseFailures.push(`${res.request().method()} ${url} -> ${status}`);
    });

    // Step 1: create a local chat by sending a message
    await page.goto(baseURL ?? "http://localhost:4173", {
      waitUntil: "domcontentloaded",
    });
    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });
    // Use force click to bypass body element pointer-events interception in tests
    await input.click({ force: true });
    await input.type("Smoke publish shared");
    await page.keyboard.press("Enter");
    // Wait for share controls to become available
    const shareButton = page
      .locator('button[title="Share this conversation"]')
      .first();
    await expect(shareButton).toBeVisible({ timeout: 30000 });

    // Step 2: open share modal and pick Shared
    await shareButton.click({ force: true });
    const modal = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal).toBeVisible({ timeout: 10000 });
    await modal.locator('input[type="radio"][value="shared"]').check();
    const genBtn = modal.getByRole("button", { name: /generate url|copy/i });
    await genBtn.click();
    const urlInput = modal.locator("#share-url-input");
    await expect(urlInput).toHaveValue(/\/(s|p)\//, { timeout: 15000 });

    // Grab the human share URL and navigate to it
    const shareUrl = await urlInput.inputValue();
    expect(shareUrl).toMatch(/\/(s|p)\//);
    await modal.getByLabel("Close").click();
    await page.goto(shareUrl, { waitUntil: "domcontentloaded" });

    expect.soft(requestFailures, requestFailures.join("\n")).toEqual([]);
    expect.soft(responseFailures, responseFailures.join("\n")).toEqual([]);
    expect.soft(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
