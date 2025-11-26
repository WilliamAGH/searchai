import { test, expect } from "@playwright/test";

test("smoke: no console errors on home", async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];
  const responseFailures: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
      const text = msg.text();
      // Ignore 403 errors from message sending - expected without API keys
      if (
        text.includes("HTTP 403") ||
        text.includes("Failed to send message") ||
        text.includes("403 (Forbidden)") ||
        text.includes("Failed to load resource") ||
        text.includes(
          'Viewport argument key "interactive-widget" not recognized',
        )
      ) {
        return;
      }
      const loc = msg.location();
      const where = loc.url
        ? `${loc.url}:${loc.lineNumber ?? 0}:${loc.columnNumber ?? 0}`
        : "";
      consoleErrors.push(`${msg.text()}${where ? `\n  at ${where}` : ""}`);
    }
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(err.stack || err.message);
  });

  const isHttp = (u: string) =>
    u.startsWith("http://") || u.startsWith("https://");

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (!isHttp(url)) return;
    // Ignore common favicon variants to reduce flakiness
    if (url.endsWith("favicon.ico") || url.endsWith("favicon.svg")) return;
    requestFailures.push(
      `${req.method()} ${url} -> ${req.failure()?.errorText}`,
    );
  });

  page.on("response", (res) => {
    const url = res.url();
    if (!isHttp(url)) return;
    const status = res.status();
    // Ignore 403 errors - these are expected from AI backend without API keys in tests
    if (status >= 400 && status !== 403) {
      responseFailures.push(`${res.request().method()} ${url} -> ${status}`);
    }
  });

  const target = baseURL ?? "http://localhost:4173";
  await page.goto(target, { waitUntil: "domcontentloaded" });

  // Basic sanity: page renders something meaningful
  await expect(page).toHaveTitle(/search|ai|SearchAI|flex|template/i, {
    timeout: 15000,
  });

  // Create chat by sending a message (toolbar is lazily rendered)
  const input = page.locator('textarea, [role="textbox"]').first();
  await expect(input).toBeVisible({ timeout: 15000 });
  // Use force click to bypass body element pointer-events interception in tests
  await input.click({ force: true });
  await input.type("Smoke home sanity");
  await page.keyboard.press("Enter");

  // Should show loading state or navigate quickly
  await page.waitForURL(/\/(chat|s|p)\//, { timeout: 15000 }).catch(() => {});

  // Verify navigation succeeded
  const currentUrl = page.url();
  expect(currentUrl).toMatch(/\/(chat|s|p)\//);

  // Fail if any console errors or request failures occurred
  expect
    .soft(
      requestFailures,
      `No failed network requests.\n${requestFailures.join("\n")}`,
    )
    .toEqual([]);
  expect
    .soft(
      responseFailures,
      `No HTTP responses with status >= 400.\n${responseFailures.join("\n")}`,
    )
    .toEqual([]);
  expect
    .soft(consoleErrors, `No console errors.\n${consoleErrors.join("\n")}`)
    .toEqual([]);
});
