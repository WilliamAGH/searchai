import type { Page } from "@playwright/test";

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

      // Set up fetch interception for search APIs and AI service
      const originalFetch = window.fetch;

      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = typeof input === "string" ? input : input.toString();

        console.log("🔧 MSW intercepting request:", url);

        // Intercept search API calls
        if (
          url.includes("serpapi.com") ||
          url.includes("openrouter.ai") ||
          url.includes("duckduckgo.com") ||
          url.includes("/api/search")
        ) {
          console.log("🔧 MSW handling search API request");

          // Add a small delay to simulate network latency
          await new Promise((resolve) => setTimeout(resolve, 500));

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

        // Intercept AI service endpoint (/api/ai)
        if (url.includes("/api/ai")) {
          console.log("🔧 MSW handling AI service request");

          // Add a small delay to simulate network latency
          await new Promise((resolve) => setTimeout(resolve, 500));

          // Parse the request body to get the user's message
          let message = "test message";
          if (init?.body) {
            try {
              const body = JSON.parse(init.body as string);
              message = body.message || "test message";
            } catch {
              // Use default message if parsing fails
              message = "test message";
            }
          }

          console.log("🔧 MSW generating AI response for message:", message);

          // Generate a simple AI response for testing
          const aiResponse =
            "This is a mock AI response for testing purposes. I understand your question and I'm here to help.";

          console.log("🔧 MSW returning AI response");

          // Return SSE stream format that the application expects
          const stream = new ReadableStream({
            start(controller) {
              // Send the response as a single chunk
              controller.enqueue(
                new TextEncoder().encode(
                  `data: ${JSON.stringify({ content: aiResponse })}\n\n`,
                ),
              );
              controller.close();
            },
          });

          return new Response(stream, {
            status: 200,
            statusText: "OK",
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        }

        console.log("🔧 MSW passing through request:", url);

        // For non-intercepted requests, use the original fetch
        return originalFetch(input, init);
      };

      console.log(
        "🔧 MSW fetch interception enabled for search APIs and AI service",
      );
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
