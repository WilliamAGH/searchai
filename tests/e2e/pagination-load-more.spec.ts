import { test, expect } from "@playwright/test";

// smoke: pagination load more UI wiring
test.describe("smoke: pagination load more", () => {
  test("increases count after load more (if chat present)", async ({
    page,
  }) => {
    await page.goto("/");

    // If no message list is rendered (no chat/seed), gracefully skip
    const countLocator = page.locator('[data-testid="count"]');
    const hasCount = await countLocator
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasCount)
      test.skip(true, "No chat/message list detected in environment");

    const initial = await countLocator.first().innerText();

    const loadMoreBtn = page.locator('[data-testid="loadMore"]');
    const hasLoadMore = await loadMoreBtn
      .first()
      .isVisible()
      .catch(() => false);
    if (!hasLoadMore) test.skip(true, "No load more button present");

    await loadMoreBtn.first().click();

    await expect(countLocator.first()).not.toHaveText(initial);
  });
});
