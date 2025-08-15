import { Page } from "@playwright/test";

/**
 * Set up MSW (Mock Service Worker) for Playwright E2E tests
 * This ensures all search API calls are mocked and tests are not rate-limited
 */
export async function setupMSWForTest(page: Page) {
  try {
    // Add MSW setup script to the page
    await page.addInitScript(() => {
      // Create a global flag to indicate MSW is enabled
      window.__MSW_ENABLED__ = true;

      // Set up fetch interception for search APIs
      const originalFetch = window.fetch;

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        // Intercept search API calls
        if (
          url.includes("serpapi.com") ||
          url.includes("openrouter.ai") ||
          url.includes("duckduckgo.com") ||
          url.includes("/api/search")
        ) {
          // Return mock search results
          const mockResponse = {
            status: 200,
            statusText: "OK",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              searchMethod: "mock",
              results: [
                {
                  title: "Mock Search Result 1",
                  url: "https://example.com/result1",
                  snippet: "This is a mock search result for testing purposes.",
                  source: "mock",
                },
                {
                  title: "Mock Search Result 2",
                  url: "https://example.com/result2",
                  snippet:
                    "Another mock search result to ensure tests work reliably.",
                  source: "mock",
                },
              ],
              hasRealResults: false,
              searchQuery: "test query",
            }),
          };

          return new Response(mockResponse.body, mockResponse);
        }

        // For non-search requests, use the original fetch
        return originalFetch(input, init);
      };

      console.log("🔧 MSW fetch interception enabled for search APIs");
    });

    console.log("✅ MSW setup completed for test");
  } catch (error) {
    console.error("❌ Failed to set up MSW for test:", error);
    // Don't fail the test - it can still run without mocks
  }
}

/**
 * Clean up MSW after tests
 */
export async function cleanupMSWForTest(page: Page) {
  try {
    await page.evaluate(() => {
      // Remove MSW flag
      delete window.__MSW_ENABLED__;

      // Restore original fetch if possible
      if (window.__ORIGINAL_FETCH__) {
        window.fetch = window.__ORIGINAL_FETCH__;
        delete window.__ORIGINAL_FETCH__;
      }
    });

    console.log("🧹 MSW cleanup completed");
  } catch (error) {
    console.error("❌ Failed to cleanup MSW:", error);
  }
}
