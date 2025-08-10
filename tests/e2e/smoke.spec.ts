import { test, expect } from "@playwright/test";

test("smoke: no console errors on home", async ({ page, baseURL }) => {
  const consoleErrors: string[] = [];
  const requestFailures: string[] = [];

  page.on("console", (msg) => {
    if (msg.type() === "error") {
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

  page.on("requestfailed", (req) => {
    // Ignore favicon failures to reduce flakiness if not present
    const url = req.url();
    if (!url.endsWith("favicon.ico")) {
      requestFailures.push(
        `${req.method()} ${url} -> ${req.failure()?.errorText}`,
      );
    }
  });

  const target = baseURL ?? "http://localhost:4173";
  await page.goto(target);

  // Basic sanity: page renders something meaningful
  await expect(page).toHaveTitle(/search|ai|SearchAI|flex|template/i, {
    timeout: 5000,
  });

  // Fail if any console errors or request failures occurred
  expect
    .soft(
      requestFailures,
      `No failed network requests.\n${requestFailures.join("\n")}`,
    )
    .toEqual([]);
  expect(
    consoleErrors,
    `No console errors.\n${consoleErrors.join("\n")}`,
  ).toEqual([]);
});
