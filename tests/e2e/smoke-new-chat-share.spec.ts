import { test, expect } from "@playwright/test";

test.describe("smoke: new chat share flow has no console errors", () => {
  test("smoke: create chat, send message, open share modal", async ({
    page,
    baseURL,
  }) => {
    const consoleErrors: string[] = [];
    const requestFailures: string[] = [];
    const responseFailures: string[] = [];

    page.on("console", (msg) => {
      if (msg.type() !== "error") return;
      const t = msg.text() || "";
      // Ignore known benign navigation-soft-fail logs from optimistic nav
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
      requestFailures.push(
        `${req.method()} ${url} -> ${req.failure()?.errorText}`,
      );
    });
    page.on("response", (res) => {
      const url = res.url();
      if (!isHttp(url)) return;
      const status = res.status();
      if (status >= 400)
        responseFailures.push(`${res.request().method()} ${url} -> ${status}`);
    });

    await page.goto(baseURL ?? "http://localhost:4173", {
      waitUntil: "domcontentloaded",
    });

    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });
    // Use force click to bypass body element pointer-events interception in tests
    await input.click({ force: true });
    await input.type("E2E smoke hello");
    await page.keyboard.press("Enter");

    // Wait for share controls to become available (appears after first message)
    const shareButton = page
      .locator('button[title="Share this conversation"]')
      .first();
    await expect(shareButton).toBeVisible({ timeout: 30000 });

    await shareButton.click({ force: true });

    // Modal visible - target ShareModal specifically (not MobileSidebar)
    const modal = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Close via title button
    await modal.getByLabel("Close").click();

    expect.soft(requestFailures, requestFailures.join("\n")).toEqual([]);
    expect.soft(responseFailures, responseFailures.join("\n")).toEqual([]);
    expect.soft(consoleErrors, consoleErrors.join("\n")).toEqual([]);
  });
});
