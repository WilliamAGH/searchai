import { expect, test } from "@playwright/test";
import { viewports } from "../../config/playwright.viewports";
import { ensureSidebarOpen } from "../helpers/sidebar-helpers";

type WidthMetric = {
  selector: string;
  scrollWidth: number;
  clientWidth: number;
};

async function collectWidthMetrics(
  page: import("@playwright/test").Page,
  selectors: string[],
): Promise<WidthMetric[]> {
  return page.evaluate((candidateSelectors) => {
    return candidateSelectors
      .map((selector) => {
        const element = document.querySelector<HTMLElement>(selector);
        if (!element) return null;
        return {
          selector,
          scrollWidth: element.scrollWidth,
          clientWidth: element.clientWidth,
        };
      })
      .filter((metric): metric is WidthMetric => metric !== null);
  }, selectors);
}

function assertNoHorizontalOverflow(
  metrics: WidthMetric[],
  phase: string,
): void {
  expect(
    metrics.length,
    `${phase}: no elements matched selectors for overflow validation`,
  ).toBeGreaterThan(0);

  for (const metric of metrics) {
    expect
      .soft(
        metric.scrollWidth,
        `${phase}: "${metric.selector}" should not exceed its viewport width`,
      )
      .toBeLessThanOrEqual(metric.clientWidth + 1);
  }
}

test.describe("mobile viewport containment", () => {
  test("keeps core chat layout and sidebars inside viewport width", async ({
    page,
  }) => {
    await page.setViewportSize(viewports.iPhone12);
    await page.goto("/");

    const input = page.locator('textarea, [role="textbox"]').first();
    await expect(input).toBeVisible({ timeout: 15000 });

    // Type a long string to stress inline layout widths.
    await input.fill(
      "viewport check ".repeat(20) +
        "this should wrap and stay inside the mobile viewport",
    );

    const baseSelectors = ["html", "body", "#root", "main"];
    assertNoHorizontalOverflow(
      await collectWidthMetrics(page, baseSelectors),
      "base layout",
    );

    await ensureSidebarOpen(page);

    const sidebarSelectors = [
      "html",
      "body",
      "#root",
      "main",
      '[role="dialog"].mobile-sidebar-dialog',
      '[role="dialog"].mobile-sidebar-dialog [role="dialog"]',
    ];
    assertNoHorizontalOverflow(
      await collectWidthMetrics(page, sidebarSelectors),
      "mobile sidebar open",
    );
  });
});
