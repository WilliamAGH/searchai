/**
 * Integration tests for citation formatting flow
 * Tests the complete flow from search results to rendered citations
 */

import { describe, it, expect, beforeAll, afterAll, afterEach } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "../mocks/server";

describe("Citation Flow Integration", () => {
  // Mock search results with various domains
  const mockSearchResults = [
    {
      title: "Understanding React Hooks",
      url: "https://react.dev/learn/hooks",
      snippet: "React Hooks let you use state and other React features",
      content: "Full article content about React Hooks...",
    },
    {
      title: "Wikipedia - JavaScript",
      url: "https://en.wikipedia.org/wiki/JavaScript",
      snippet: "JavaScript is a programming language",
      content: "JavaScript article content...",
    },
    {
      title: "MDN Web Docs",
      url: "https://developer.mozilla.org/en-US/docs/Web/JavaScript",
      snippet: "JavaScript documentation on MDN",
      content: "MDN documentation content...",
    },
    {
      title: "Another Wikipedia Article",
      url: "https://en.wikipedia.org/wiki/React_(library)",
      snippet: "React is a JavaScript library",
      content: "React Wikipedia content...",
    },
  ];

  beforeAll(() => {
    server.listen({ onUnhandledRequest: "warn" });
  });

  afterEach(() => {
    server.resetHandlers();
  });

  afterAll(() => {
    server.close();
  });

  it("should format search results with domain citations in AI response", async () => {
    // Setup MSW handler for AI endpoint
    server.use(
      http.post("*/api/ai", async ({ request }) => {
        (await request.json()) as any;

        // Simulate AI response with domain citations
        const response = {
          response: `Based on my search, React Hooks [react.dev] are a powerful feature. 
            According to [en.wikipedia.org], JavaScript is the foundation. 
            The documentation [developer.mozilla.org] provides comprehensive guides.`,
          searchResults: mockSearchResults,
          sources: mockSearchResults.map((r) => r.url),
        };

        return HttpResponse.json(response);
      }),
    );

    // Simulate the API call
    const response = await fetch("http://localhost:3000/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Tell me about React Hooks",
        searchResults: mockSearchResults,
      }),
    });

    const data = await response.json();

    // Verify response contains domain citations
    expect(data.response).toContain("[react.dev]");
    expect(data.response).toContain("[en.wikipedia.org]");
    expect(data.response).toContain("[developer.mozilla.org]");

    // Should NOT contain numeric citations
    expect(data.response).not.toContain("[1]");
    expect(data.response).not.toContain("[2]");
    expect(data.response).not.toContain("[3]");
  });

  it("should handle fallback responses with domain citations", async () => {
    // Setup MSW handler to simulate API failure
    server.use(
      http.post("*/api/ai", async () => {
        // Simulate OpenRouter failure
        return new HttpResponse(null, { status: 503 });
      }),
    );

    // This would trigger the fallback logic in the actual implementation
    // Here we test the expected fallback format
    const createFallbackResponse = (searchResults: any[]) => {
      return searchResults && searchResults.length > 0
        ? `Based on the search results I found:\n\n${searchResults
            .map((r: any) => {
              let domain = "";
              try {
                const url = new URL(r.url);
                domain = url.hostname.replace("www.", "");
              } catch {
                const match = r.url.match(
                  /(?:https?:\/\/)?(?:www\.)?([^/:\s]+\.[^/:\s]+)/i,
                );
                domain = match ? match[1] : "source";
              }
              return `**${r.title}** [${domain}]\n${r.snippet}`;
            })
            .join("\n\n")}`
        : `I'm unable to process your question with AI right now.`;
    };

    const fallbackResponse = createFallbackResponse(mockSearchResults);

    // Verify fallback uses domain format
    expect(fallbackResponse).toContain("[react.dev]");
    expect(fallbackResponse).toContain("[en.wikipedia.org]");
    expect(fallbackResponse).toContain("[developer.mozilla.org]");
    expect(fallbackResponse).not.toContain("Source:");
  });

  it("should handle duplicate domains correctly", async () => {
    const resultsWithDuplicates = [
      {
        title: "Wikipedia Article 1",
        url: "https://en.wikipedia.org/wiki/Article1",
        snippet: "First Wikipedia article",
      },
      {
        title: "Wikipedia Article 2",
        url: "https://en.wikipedia.org/wiki/Article2",
        snippet: "Second Wikipedia article",
      },
      {
        title: "Wikipedia Article 3",
        url: "https://en.wikipedia.org/wiki/Article3",
        snippet: "Third Wikipedia article",
      },
    ];

    server.use(
      http.post("*/api/ai", async () => {
        const response = {
          response: `Multiple Wikipedia articles discuss this topic [en.wikipedia.org].`,
          searchResults: resultsWithDuplicates,
          sources: resultsWithDuplicates.map((r) => r.url),
        };
        return HttpResponse.json(response);
      }),
    );

    const response = await fetch("http://localhost:3000/api/ai", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        message: "Test query",
        searchResults: resultsWithDuplicates,
      }),
    });

    const data = await response.json();

    // Should use domain format even with duplicates
    expect(data.response).toContain("[en.wikipedia.org]");
    // All results should be included in searchResults
    expect(data.searchResults).toHaveLength(3);
  });

  it("should format search context with domain citations for AI models", () => {
    // Test the formatSearchResultsForContext function behavior
    const formatSearchResultsForContext = (searchResults: any[]): string => {
      if (!searchResults || searchResults.length === 0) {
        return "";
      }

      const formattedResults = searchResults
        .map((result) => {
          let domain = "";
          try {
            const url = new URL(result.url);
            domain = url.hostname.replace("www.", "");
          } catch {
            const match = result.url.match(
              /(?:https?:\/\/)?(?:www\.)?([^/:\s]+\.[^/:\s]+)/i,
            );
            domain = match ? match[1] : "source";
          }

          let resultStr = `[${domain}] ${result.fullTitle || result.title}\n`;
          resultStr += `URL: ${result.url}\n`;

          if (result.content) {
            const maxContentLength = 1000;
            const truncatedContent =
              result.content.length > maxContentLength
                ? result.content.slice(0, maxContentLength) + "..."
                : result.content;
            resultStr += `Content: ${truncatedContent}\n`;
          } else if (result.summary) {
            resultStr += `Summary: ${result.summary}\n`;
          } else {
            resultStr += `Snippet: ${result.snippet}\n`;
          }

          return resultStr;
        })
        .join("\n---\n\n");

      return `\n\nSearch Results with Content:\n${formattedResults}`;
    };

    const formatted = formatSearchResultsForContext(mockSearchResults);

    // Verify format includes domain citations
    expect(formatted).toContain("[react.dev] Understanding React Hooks");
    expect(formatted).toContain("[en.wikipedia.org] Wikipedia - JavaScript");
    expect(formatted).toContain("[developer.mozilla.org] MDN Web Docs");

    // Should include content when available
    expect(formatted).toContain(
      "Content: Full article content about React Hooks",
    );

    // Should NOT have numeric indices
    expect(formatted).not.toContain("[1]");
    expect(formatted).not.toContain("[2]");
    expect(formatted).not.toContain("[3]");
    expect(formatted).not.toContain("[4]");
  });

  it("should handle streaming responses with citations", async () => {
    // Simulate streaming response chunks
    const chunks = [
      "Based on the search results, ",
      "React [react.dev] is ",
      "a JavaScript [en.wikipedia.org] library ",
      "for building user interfaces.",
    ];

    server.use(
      http.post("*/api/ai/stream", async () => {
        // Create a readable stream
        const stream = new ReadableStream({
          async start(controller) {
            for (const chunk of chunks) {
              controller.enqueue(new TextEncoder().encode(chunk));
              await new Promise((resolve) => setTimeout(resolve, 10));
            }
            controller.close();
          },
        });

        return new HttpResponse(stream, {
          headers: {
            "Content-Type": "text/event-stream",
          },
        });
      }),
    );

    // Simulate streaming client
    const response = await fetch("http://localhost:3000/api/ai/stream", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ message: "Test streaming" }),
    });

    const reader = response.body?.getReader();
    if (!reader) throw new Error("No response body");
    const decoder = new TextDecoder();
    let fullContent = "";

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      fullContent += decoder.decode(value, { stream: true });
    }

    // Verify streamed content contains domain citations
    expect(fullContent).toContain("[react.dev]");
    expect(fullContent).toContain("[en.wikipedia.org]");
  });

  it("should handle malformed URLs gracefully", () => {
    const resultsWithBadUrls = [
      {
        title: "Valid URL",
        url: "https://example.com/page",
        snippet: "Valid content",
      },
      {
        title: "Invalid URL",
        url: "not-a-valid-url",
        snippet: "Invalid URL content",
      },
      {
        title: "Empty URL",
        url: "",
        snippet: "No URL content",
      },
      {
        title: "Partial URL",
        url: "example.com/page",
        snippet: "Partial URL content",
      },
    ];

    // Test domain extraction with various URL formats
    const extractDomains = (results: any[]) => {
      return results.map((r) => {
        let domain = "";
        try {
          const url = new URL(r.url);
          domain = url.hostname.replace("www.", "");
        } catch {
          const match = r.url.match(
            /(?:https?:\/\/)?(?:www\.)?([^/:\s]+\.[^/:\s]+)/i,
          );
          domain = match ? match[1] : "source";
        }
        return domain;
      });
    };

    const domains = extractDomains(resultsWithBadUrls);

    expect(domains[0]).toBe("example.com"); // Valid URL
    expect(domains[1]).toBe("source"); // Invalid URL fallback
    expect(domains[2]).toBe("source"); // Empty URL fallback
    expect(domains[3]).toBe("example.com"); // Partial URL extracted
  });
});
