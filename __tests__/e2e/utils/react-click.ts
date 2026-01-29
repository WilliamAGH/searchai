import { Page } from "@playwright/test";

/**
 * Click handler for React components that may have pointer-events issues.
 * Uses force click to bypass body element interception.
 * Waits for element to be attached before clicking.
 * @throws If element not found or click fails - errors propagate to caller
 */
export async function reactClick(page: Page, selector: string): Promise<void> {
  const element = page.locator(selector).first();
  await element.waitFor({ state: "attached", timeout: 5000 });
  await element.click({ force: true });
}

/**
 * Alias for backward compatibility
 */
export const clickReactElement = reactClick;

/**
 * Fill input with React-friendly approach
 */
export async function reactFill(page: Page, selector: string, text: string) {
  const element = page.locator(selector).first();
  await element.click({ force: true });
  await element.fill(text);
}
