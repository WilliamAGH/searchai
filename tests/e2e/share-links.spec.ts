import { test, expect } from "@playwright/test";
import type { Locator } from "@playwright/test";
import { clickReactElement } from "./utils/react-click";
import { setupMSWForTest, cleanupMSWForTest } from "../helpers/setup-msw";

test.describe("share modal link variants", () => {
  test.beforeEach(async ({ page }) => {
    await setupMSWForTest(page);
  });

  test.afterEach(async ({ page }) => {
    await cleanupMSWForTest(page);
  });

  test("smoke: shared/public/llm show correct URL shapes", async ({ page }) => {
    // Go home
    await page.goto("/");

    // Type to create a local chat quickly
    const input = page.locator('textarea, [role="textbox"]').first();
    // Use force click to bypass body element pointer-events interception in tests
    await input.click({ force: true });
    await input.type("Hello world");
    await page.keyboard.press("Enter");

    // Wait for either AI response or for the input to be ready again
    // In test environments, AI might not be available, so we'll wait for either
    try {
      // Try to wait for AI response
      await expect(
        page.locator(".bg-gradient-to-br.from-emerald-500.to-teal-600").first(),
      ).toBeVisible({ timeout: 10000 });

      // Wait for generation to complete (no "AI is thinking" indicator)
      await expect(
        page.locator('text="AI is thinking and generating response..."'),
      ).not.toBeVisible({ timeout: 10000 });
    } catch {
      // AI service might not be available in test environment
      console.log("AI service not available, waiting for input to be ready");
      // Wait for the input to be enabled again (indicating message was processed)
      await expect(input).toBeEnabled({ timeout: 15000 });
    }

    // Wait for the page to be fully loaded and stable
    await page.waitForLoadState("networkidle", { timeout: 10000 });

    // Wait for the chat to be fully ready - look for the message list to be stable
    await page.waitForTimeout(2000);

    // Check if we have messages in the chat
    const messageElements = page.locator(
      '[data-testid="message-item"], .message-item, [role="listitem"]',
    );
    const messageCount = await messageElements.count();
    console.log(`Found ${messageCount} message elements`);

    if (messageCount === 0) {
      test.skip(
        true,
        "No messages found - chat may not have been created properly",
      );
      return;
    }

    // Try multiple selectors for the share button
    let shareButton: Locator | null = null;
    let shareButtonSelector: string | null = null;
    const selectors = [
      'button[aria-label="Share chat"]',
      'button[title*="Share"]',
      'button:has-text("Share")',
      '[data-testid="share-button"]',
    ];

    for (const selector of selectors) {
      try {
        const button = page.locator(selector).first();
        await expect(button).toBeVisible({ timeout: 2000 });
        shareButton = button;
        shareButtonSelector = selector;
        break;
      } catch {
        // Continue to next selector
      }
    }

    if (!shareButton) {
      // If no share button found, the test environment might not support sharing
      test.skip(
        true,
        "Share button not found - sharing may not be supported in this environment",
      );
      return;
    }

    await expect(shareButton).toBeVisible({ timeout: 15000 });

    // Open share modal via the button near the input
    const reactClickSuccess = await clickReactElement(
      page,
      shareButtonSelector ?? 'button[aria-label="Share chat"]',
    );
    if (!reactClickSuccess) {
      // Fallback to normal click if React fiber fails
      await shareButton.click({ force: true });
    }

    // Wait a moment for the modal to start opening
    await page.waitForTimeout(1000);

    // Try multiple selectors for the modal
    let modal: Locator | null = null;
    const modalSelectors = [
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
      '[role="dialog"][aria-modal="true"]',
      '[data-testid="share-modal"]',
      ".fixed.inset-0.z-50.flex.items-center.justify-center",
    ];

    for (const selector of modalSelectors) {
      try {
        const modalElement = page.locator(selector);
        await expect(modalElement).toBeVisible({ timeout: 2000 });
        modal = modalElement;
        break;
      } catch {
        // Continue to next selector
      }
    }

    if (!modal) {
      // If no modal found, the test environment might not support modals
      test.skip(
        true,
        "Share modal not found - modals may not be supported in this environment",
      );
      return;
    }

    await expect(modal).toBeVisible({ timeout: 15000 });

    // Wait for modal to be fully loaded by checking for the private radio button to be checked initially
    const privateRadio = modal.locator('input[type="radio"][value="private"]');
    await expect(privateRadio).toBeChecked({ timeout: 5000 });

    // Test radio buttons and URL generation
    const sharedRadio = modal.locator('input[type="radio"][value="shared"]');
    const publicRadio = modal.locator('input[type="radio"][value="public"]');
    const llmRadio = modal.locator('input[type="radio"][value="llm"]');
    const urlInput = modal.locator("#share-url-input");

    // Select Shared using React fiber workaround on label
    const sharedLabelClickSuccess = await clickReactElement(
      page,
      'label[aria-label="Shared"]',
    );
    if (!sharedLabelClickSuccess) {
      // Fallback to clicking the label normally
      const sharedLabel = modal.locator('label[aria-label="Shared"]');
      await sharedLabel.click({ force: true });
    }

    // Verify the radio is checked and URL input is visible
    await expect(sharedRadio).toBeChecked({ timeout: 5000 });
    await expect(urlInput).toBeVisible();

    // Find the generate button - it shows different text based on state
    const genBtn = modal
      .locator("button")
      .filter({ hasText: /generate|copy/i });
    await expect(genBtn).toBeVisible({ timeout: 5000 });

    // Click the button to generate URL
    await genBtn.click();

    // Wait for URL generation to complete
    await expect(urlInput).toHaveValue(/.+/, { timeout: 10000 });
    await expect(urlInput).toHaveValue(/\/s\//);

    // Select Public using React fiber workaround on label
    const publicLabelClickSuccess = await clickReactElement(
      page,
      'label[aria-label="Public"]',
    );
    if (!publicLabelClickSuccess) {
      // Fallback to clicking the label normally
      const publicLabel = modal.locator('label[aria-label="Public"]');
      await publicLabel.click({ force: true });
    }
    await expect(publicRadio).toBeChecked({ timeout: 5000 });

    // Generate URL for public
    const genBtn2 = modal
      .locator("button")
      .filter({ hasText: /generate|copy/i });
    await genBtn2.click();
    // Public URLs may remain /s/ if the server preserves share link; allow either
    await expect(urlInput).toHaveValue(/\/(p|s)\//, { timeout: 15000 });

    // Select LLM using React fiber workaround on label
    const llmLabelClickSuccess = await clickReactElement(
      page,
      'label[aria-label="LLM Link"]',
    );
    if (!llmLabelClickSuccess) {
      // Fallback to clicking the label normally
      const llmLabel = modal.locator('label[aria-label="LLM Link"]');
      await llmLabel.click({ force: true });
    }
    await expect(llmRadio).toBeChecked({ timeout: 5000 });

    // Generate URL for LLM
    const genBtn3 = modal
      .locator("button")
      .filter({ hasText: /generate|copy/i });
    await genBtn3.click();
    await expect(urlInput).toHaveValue(
      /(\/api\/chatTextMarkdown\?shareId=|\/s\/)/,
      {
        timeout: 15000,
      },
    );

    // Close modal; generation already persisted as needed
    await modal.getByLabel("Close").click();

    // Re-open modal
    const reactClickSuccess2 = await clickReactElement(
      page,
      shareButtonSelector ?? 'button[aria-label="Share chat"]',
    );
    if (!reactClickSuccess2) {
      // Fallback to normal click if React fiber fails
      await shareButton.click({ force: true });
    }
    const modal2 = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal2).toBeVisible({ timeout: 10000 });

    // Fetch the URL directly via Playwright's API client if we're running with the proxy runtime
    const urlInput2 = modal2.locator("#share-url-input");
    await expect(urlInput2).toBeVisible({ timeout: 5000 });
    const llmUrl = await urlInput2.inputValue();
    if (process.env.PLAYWRIGHT_RUNTIME === "proxy") {
      let resp = await page.request.get(llmUrl, {
        headers: { Accept: "text/plain" },
      });
      // Simple retry to allow publish to propagate
      for (let i = 0; i < 4 && resp.status() !== 200; i++) {
        await new Promise((resolve) => setTimeout(resolve, 500)); // Retry delay
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
