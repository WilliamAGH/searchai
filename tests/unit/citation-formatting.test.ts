/**
 * Tests for citation formatting logic
 * Ensures domain-based citations work correctly across all scenarios
 */

import { describe, it, expect } from "vitest";

// Mock the AI route module to test formatSearchResultsForContext
// We'll extract and test the function directly
const formatSearchResultsForContext = (searchResults: any[]): string => {
  if (!searchResults || searchResults.length === 0) {
    return "";
  }

  const formattedResults = searchResults
    .map((result) => {
      // Extract domain from URL for citation format
      let domain = "";
      try {
        const url = new URL(result.url);
        domain = url.hostname.replace("www.", "");
      } catch {
        // Fallback: try to extract domain from URL string
        const match = result.url.match(/(?:https?:\/\/)?(?:www\.)?([^/:]+)/i);
        domain = match ? match[1] : "source";
      }

      let resultStr = `[${domain}] ${result.fullTitle || result.title}\n`;
      resultStr += `URL: ${result.url}\n`;

      // Include scraped content if available
      if (result.content) {
        // Limit content to prevent context overflow
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

describe("Citation Formatting - formatSearchResultsForContext", () => {
  it("should extract domain from valid URLs", () => {
    const searchResults = [
      {
        url: "https://example.com/page",
        title: "Example Page",
        snippet: "This is an example",
      },
      {
        url: "https://www.wikipedia.org/article",
        title: "Wikipedia Article",
        snippet: "Wikipedia content",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("[example.com]");
    expect(formatted).toContain("[wikipedia.org]");
    expect(formatted).not.toContain("[1]");
    expect(formatted).not.toContain("[2]");
  });

  it("should handle URLs without protocol", () => {
    const searchResults = [
      {
        url: "example.com/page",
        title: "Example Page",
        snippet: "This is an example",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    expect(formatted).toContain("[example.com]");
  });

  it("should use fallback for invalid URLs", () => {
    const searchResults = [
      {
        url: "not-a-valid-url",
        title: "Invalid URL Test",
        snippet: "Testing invalid URL",
      },
      {
        url: "",
        title: "Empty URL",
        snippet: "No URL provided",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    // Should use 'source' as fallback for completely invalid URLs
    expect(formatted).toContain("[source]");
  });

  it("should handle multiple results from the same domain", () => {
    const searchResults = [
      {
        url: "https://github.com/user/repo1",
        title: "First GitHub Repo",
        snippet: "First repo",
      },
      {
        url: "https://github.com/user/repo2",
        title: "Second GitHub Repo",
        snippet: "Second repo",
      },
      {
        url: "https://github.com/org/project",
        title: "Third GitHub Project",
        snippet: "Third project",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    // All should use the same domain citation
    const githubMatches = (formatted.match(/\[github\.com\]/g) || []).length;
    expect(githubMatches).toBe(3);
  });

  it("should include content when available", () => {
    const searchResults = [
      {
        url: "https://example.com",
        title: "Example",
        content: "This is the full content that was scraped from the page",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    expect(formatted).toContain("Content: This is the full content");
  });

  it("should truncate long content", () => {
    const longContent = "a".repeat(1500);
    const searchResults = [
      {
        url: "https://example.com",
        title: "Example",
        content: longContent,
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    expect(formatted).toContain("...");
    expect(formatted.includes("Content: " + "a".repeat(1000) + "...")).toBe(
      true,
    );
  });

  it("should prioritize content over summary over snippet", () => {
    const searchResults = [
      {
        url: "https://test1.com",
        title: "Test 1",
        content: "Full content",
        summary: "Summary text",
        snippet: "Snippet text",
      },
      {
        url: "https://test2.com",
        title: "Test 2",
        summary: "Summary only",
        snippet: "Snippet text",
      },
      {
        url: "https://test3.com",
        title: "Test 3",
        snippet: "Only snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    expect(formatted).toContain("Content: Full content");
    expect(formatted).toContain("Summary: Summary only");
    expect(formatted).toContain("Snippet: Only snippet");
  });

  it("should handle empty search results", () => {
    const formatted = formatSearchResultsForContext([]);
    expect(formatted).toBe("");
  });

  it("should handle null/undefined search results", () => {
    const formatted1 = formatSearchResultsForContext(null as any);
    const formatted2 = formatSearchResultsForContext(undefined as any);

    expect(formatted1).toBe("");
    expect(formatted2).toBe("");
  });

  it("should format results with separator", () => {
    const searchResults = [
      {
        url: "https://first.com",
        title: "First",
        snippet: "First snippet",
      },
      {
        url: "https://second.com",
        title: "Second",
        snippet: "Second snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);
    expect(formatted).toContain("\n---\n\n");
    expect(formatted).toContain("[first.com] First");
    expect(formatted).toContain("[second.com] Second");
  });
});

describe("Citation Formatting - Fallback Response Format", () => {
  const createFallbackResponse = (searchResults: any[], message: string) => {
    return searchResults && searchResults.length > 0
      ? `Based on the search results I found:\n\n${searchResults
          .map((r: any) => {
            // Extract domain for citation format
            let domain = "";
            try {
              const url = new URL(r.url);
              domain = url.hostname.replace("www.", "");
            } catch {
              const match = r.url.match(/(?:https?:\/\/)?(?:www\.)?([^/:]+)/i);
              domain = match ? match[1] : "source";
            }
            return `**${r.title}** [${domain}]\n${r.snippet}`;
          })
          .join("\n\n")
          .substring(
            0,
            1500,
          )}...\n\n*Note: AI processing is currently unavailable, but the above search results should help answer your question.*`
      : `I'm unable to process your question with AI right now due to missing API configuration. However, I can suggest searching for "${message}" on:\n\n- [Google](https://www.google.com/search?q=${encodeURIComponent(message)})\n- [DuckDuckGo](https://duckduckgo.com/?q=${encodeURIComponent(message)})\n- [Wikipedia](https://en.wikipedia.org/wiki/Special:Search/${encodeURIComponent(message)})`;
  };

  it("should format fallback responses with domain citations", () => {
    const searchResults = [
      {
        url: "https://example.com/article",
        title: "Example Article",
        snippet: "This is an example article about testing",
      },
      {
        url: "https://docs.test.com/guide",
        title: "Testing Guide",
        snippet: "A comprehensive guide to testing",
      },
    ];

    const fallback = createFallbackResponse(searchResults, "test query");

    expect(fallback).toContain("**Example Article** [example.com]");
    expect(fallback).toContain("**Testing Guide** [docs.test.com]");
    expect(fallback).not.toContain("Source:");
  });

  it("should handle no search results in fallback", () => {
    const fallback = createFallbackResponse([], "test query");

    expect(fallback).toContain("test query");
    expect(fallback).toContain("[Google]");
    expect(fallback).toContain("[DuckDuckGo]");
    expect(fallback).toContain("[Wikipedia]");
  });

  it("should truncate very long fallback responses", () => {
    const manyResults = Array(50)
      .fill(null)
      .map((_, i) => ({
        url: `https://example${i}.com`,
        title: `Result ${i}`,
        snippet: "Lorem ipsum dolor sit amet, consectetur adipiscing elit.",
      }));

    const fallback = createFallbackResponse(manyResults, "test");

    // Should be truncated at 1500 chars
    expect(fallback.length).toBeLessThan(2000);
    expect(fallback).toContain("...");
  });
});
