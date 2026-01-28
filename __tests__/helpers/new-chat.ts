import type { Page } from "@playwright/test";

export async function setupNewChatPage(page: Page): Promise<void> {
  await page.goto("/", { waitUntil: "domcontentloaded" });
  await page.waitForLoadState("domcontentloaded");
  await page.waitForSelector(
    '[data-testid="message-input"], textarea, [role="textbox"]',
    { timeout: 30000 },
  );
}
