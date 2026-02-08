import type { Page } from "@playwright/test";

export async function setupNewChatPage(page: Page): Promise<void> {
  const response = await page.goto("/", { waitUntil: "domcontentloaded" });
  if (response && response.status() === 404) {
    await page.goto("/index.html", { waitUntil: "domcontentloaded" });
  }
  await page.waitForSelector(
    '[data-testid="message-input"], textarea, [role="textbox"]',
    {
      timeout: 30000,
    },
  );
}
