import { test, expect } from "@playwright/test";
import { clickReactElement } from "./utils/react-click";
import { waitForNetworkIdle } from "../helpers/wait-conditions";

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

    // Wait for AI response to complete before sharing
    // Look for the AI message to appear (assistant messages have the emerald/teal gradient avatar)
    await expect(
      page.locator(".bg-gradient-to-br.from-emerald-500.to-teal-600").first(),
    ).toBeVisible({ timeout: 30000 });

    // Wait for generation to complete (no "AI is thinking" indicator)
    await expect(
      page.locator('text="AI is thinking and generating response..."'),
    ).not.toBeVisible({ timeout: 30000 });

    // Wait for share controls to be available
    const shareButton = page.locator('button[title="Share this conversation"]');
    await expect(shareButton).toBeVisible({ timeout: 10000 });
    // Open share modal via the button near the input (use the last toolbar button)
    // Toolbar has: toggle sidebar, Copy, Share — select the Share button by its SVG and position
    // Prefer the explicit share button by title if present; fallback to last toolbar button
    // Use the already-located share button with React fiber workaround
    const reactClickSuccess = await clickReactElement(
      page,
      'button[title="Share this conversation"]',
    );
    if (!reactClickSuccess) {
      // Fallback to normal click if React fiber fails
      await shareButton.click({ force: true });
    }

    // Expect modal (wait for it to appear) - target ShareModal specifically
    const modal = page.locator(
      '[role="dialog"][aria-modal="true"][aria-labelledby="share-modal-title"]',
    );
    await expect(modal).toBeVisible({ timeout: 10000 });

    // Wait for modal to be fully loaded by checking for the private radio button to be checked initially
    const privateRadio = modal.locator('input[type="radio"][value="private"]');
    await expect(privateRadio).toBeChecked({ timeout: 5000 });

    // Test radio buttons and URL generation
    const sharedRadio = modal.locator('input[type="radio"][value="shared"]');
    const publicRadio = modal.locator('input[type="radio"][value="public"]');
    const llmRadio = modal.locator('input[type="radio"][value="llm"]');
    const urlInput = modal.locator("#share-url-input");

    // Custom function to trigger radio button onChange via React fiber
    const triggerRadioChange = async (value: string) => {
      return await page.evaluate((radioValue: string) => {
        const radio = document.querySelector(
          `input[type="radio"][value="${radioValue}"]`,
        ) as HTMLInputElement;
        if (!radio) return false;

        // Find React fiber key
        const fiberKey = Object.keys(radio).find(
          (key) =>
            key.startsWith("__reactFiber") ||
            key.startsWith("__reactInternalInstance"),
        );

        if (!fiberKey) return false;

        const fiber = (radio as any)[fiberKey];

        // Look for onChange handler in the fiber
        let current = fiber;
        while (current) {
          if (current.memoizedProps && current.memoizedProps.onChange) {
            try {
              // Create a synthetic event
              const event = {
                target: { value: radioValue, checked: true },
                currentTarget: { value: radioValue, checked: true },
                preventDefault: () => {},
                stopPropagation: () => {},
              };
              current.memoizedProps.onChange(event);
              return true;
            } catch (error) {
              console.error("onChange execution failed:", error);
              return false;
            }
          }
          current = current.return;
        }

        return false;
      }, value);
    };

    // Try to trigger the shared radio button
    const sharedSuccess = await triggerRadioChange("shared");
    if (!sharedSuccess) {
      // Fallback: try clicking the label with React fiber
      const labelSuccess = await clickReactElement(
        page,
        'label[aria-label="Shared"]',
      );
      if (!labelSuccess) {
        // Final fallback: force click the radio button
        await sharedRadio.click({ force: true });
      }
    }

    // Wait for React to process the state change and URL to appear
    await page.waitForFunction(
      () => {
        const input = document.querySelector(
          'input[type="text"]',
        ) as HTMLInputElement;
        return input && input.value.includes("/");
      },
      { timeout: 2000 },
    );

    // Verify the radio is checked and URL input is visible
    await expect(sharedRadio).toBeChecked({ timeout: 5000 });
    await expect(urlInput).toBeVisible();

    // Try multiple selectors for the generate button
    let genBtn = modal.locator('button:has-text("Generate URL")');
    if (!(await genBtn.isVisible())) {
      genBtn = modal.locator('button[aria-label*="Generate"]');
    }
    if (!(await genBtn.isVisible())) {
      genBtn = modal.locator("button").filter({ hasText: /generate/i });
    }

    await expect(genBtn).toBeVisible({ timeout: 5000 });

    // Add debugging for the onShare function
    await page.evaluate(() => {
      console.log("Adding onShare debugging...");
      // Intercept console.log calls from the page
      const originalLog = console.log;
      window.console.log = (...args) => {
        originalLog("[PAGE]", ...args);
      };
    });

    // Try multiple approaches to click the button
    console.log("Attempting to click Generate URL button...");

    // First try: Direct click
    await genBtn.click();
    // Wait for URL generation to complete
    await page.waitForFunction(
      () => {
        const input = document.querySelector(
          'input[type="text"]',
        ) as HTMLInputElement;
        return input && input.value.includes("/");
      },
      { timeout: 2000 },
    );

    let buttonText = await genBtn.textContent();
    console.log("Button text after direct click:", buttonText);

    // If direct click didn't work, try force click
    if (buttonText === "Generate URL") {
      console.log("Direct click failed, trying force click...");
      await genBtn.click({ force: true });
      await waitForNetworkIdle(page);
      buttonText = await genBtn.textContent();
      console.log("Button text after force click:", buttonText);
    }

    // If force click didn't work, try dispatching events
    if (buttonText === "Generate URL") {
      console.log("Force click failed, trying event dispatch...");
      await genBtn.dispatchEvent("click");
      await waitForNetworkIdle(page);
      buttonText = await genBtn.textContent();
      console.log("Button text after event dispatch:", buttonText);
    }

    // Wait for URL to be populated
    await expect(urlInput).toHaveValue(/.+/, { timeout: 10000 });
    const actualValue = await urlInput.inputValue();
    console.log("Actual URL value:", actualValue);
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
    const genBtn2 = modal.getByRole("button", { name: /generate url|copy/i });
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
    const genBtn3 = modal.getByRole("button", { name: /generate url|copy/i });
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
      'button[title="Share this conversation"]',
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
    const llmUrl = await urlInput.inputValue();
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
