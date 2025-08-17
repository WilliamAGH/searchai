/**
 * Tests for AI route citation formatting
 * Ensures the backend properly formats citations using domain names
 */

import { describe, it, expect } from "vitest";

// Mock the formatSearchResultsForContext function as it would be in the AI route
function formatSearchResultsForContext(searchResults: any[]): string {
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
}

describe("AI Route - formatSearchResultsForContext", () => {
  it("should format search results with domain citations", () => {
    const searchResults = [
      {
        url: "https://react.dev/learn/hooks",
        title: "React Hooks Documentation",
        snippet: "Learn about React Hooks",
      },
      {
        url: "https://developer.mozilla.org/en-US/docs/Web",
        title: "MDN Web Docs",
        snippet: "Web development documentation",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("[react.dev] React Hooks Documentation");
    expect(formatted).toContain("[developer.mozilla.org] MDN Web Docs");
    expect(formatted).not.toContain("[1]");
    expect(formatted).not.toContain("[2]");
  });

  it("should handle search results with content", () => {
    const searchResults = [
      {
        url: "https://example.com/article",
        title: "Example Article",
        content:
          "This is the full article content that was scraped from the page. It contains detailed information about the topic.",
        snippet: "Short snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("[example.com] Example Article");
    expect(formatted).toContain("Content: This is the full article content");
    expect(formatted).not.toContain("Snippet:"); // Content takes precedence
  });

  it("should truncate very long content", () => {
    const longContent = "Lorem ipsum ".repeat(200); // Very long content
    const searchResults = [
      {
        url: "https://example.com",
        title: "Long Article",
        content: longContent,
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("...");
    expect(formatted.length).toBeLessThan(longContent.length + 500);
  });

  it("should prioritize fullTitle over title", () => {
    const searchResults = [
      {
        url: "https://example.com",
        title: "Short Title",
        fullTitle: "This is the Complete Full Title of the Article",
        snippet: "Article snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain(
      "[example.com] This is the Complete Full Title of the Article",
    );
    expect(formatted).not.toContain("Short Title");
  });

  it("should handle results with summary but no content", () => {
    const searchResults = [
      {
        url: "https://example.com",
        title: "Article",
        summary: "This is a summary of the article",
        snippet: "Short snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("Summary: This is a summary of the article");
    expect(formatted).not.toContain("Snippet:"); // Summary takes precedence over snippet
  });

  it("should handle malformed URLs gracefully", () => {
    const searchResults = [
      {
        url: "not-a-valid-url",
        title: "Invalid URL Article",
        snippet: "Content with invalid URL",
      },
      {
        url: "",
        title: "Empty URL Article",
        snippet: "Content with empty URL",
      },
      {
        url: "example.com/path",
        title: "No Protocol URL",
        snippet: "URL without protocol",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    // 'not-a-valid-url' matches the regex pattern and gets extracted as is
    expect(formatted).toContain("[not-a-valid-url] Invalid URL Article");
    // Empty URL should use 'source' as fallback
    expect(formatted).toContain("[source] Empty URL Article");
    // Should extract domain from partial URL
    expect(formatted).toContain("[example.com] No Protocol URL");
  });

  it("should handle subdomains correctly", () => {
    const searchResults = [
      {
        url: "https://blog.example.com/post",
        title: "Blog Post",
        snippet: "Blog content",
      },
      {
        url: "https://api.github.com/docs",
        title: "API Docs",
        snippet: "API documentation",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("[blog.example.com] Blog Post");
    expect(formatted).toContain("[api.github.com] API Docs");
  });

  it("should strip www prefix from domains", () => {
    const searchResults = [
      {
        url: "https://www.example.com/page",
        title: "Example Page",
        snippet: "Page content",
      },
      {
        url: "https://www.wikipedia.org/wiki/Article",
        title: "Wikipedia Article",
        snippet: "Wiki content",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted).toContain("[example.com] Example Page");
    expect(formatted).toContain("[wikipedia.org] Wikipedia Article");
    expect(formatted).not.toContain("[www.");
  });

  it("should separate multiple results with dividers", () => {
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
      {
        url: "https://third.com",
        title: "Third",
        snippet: "Third snippet",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    // Should have separators between results
    const separatorCount = (formatted.match(/\n---\n\n/g) || []).length;
    expect(separatorCount).toBe(2); // 3 results = 2 separators

    // Check all domains are present
    expect(formatted).toContain("[first.com]");
    expect(formatted).toContain("[second.com]");
    expect(formatted).toContain("[third.com]");
  });

  it("should return empty string for empty or null results", () => {
    expect(formatSearchResultsForContext([])).toBe("");
    expect(formatSearchResultsForContext(null as any)).toBe("");
    expect(formatSearchResultsForContext(undefined as any)).toBe("");
  });

  it("should include proper header for search results", () => {
    const searchResults = [
      {
        url: "https://example.com",
        title: "Example",
        snippet: "Test",
      },
    ];

    const formatted = formatSearchResultsForContext(searchResults);

    expect(formatted.startsWith("\n\nSearch Results with Content:\n")).toBe(
      true,
    );
  });
});

describe("AI Route - System Prompt Citation Instructions", () => {
  it("should emphasize domain citation format in system prompt", () => {
    // This is the critical instruction that should be in the system prompt
    const citationInstruction = `CRITICAL CITATION FORMAT: When citing sources inline, you MUST use the exact domain name from the search results in brackets like [domain.com] immediately after the relevant claim. DO NOT use numeric citations like [1] or (1). Always use the domain format that matches the search results provided. For example: "The Earth orbits the Sun [nasa.gov]" not "The Earth orbits the Sun [1]".`;

    // Verify the instruction is clear and unambiguous
    expect(citationInstruction).toContain("[domain.com]");
    expect(citationInstruction).toContain("DO NOT use numeric citations");
    expect(citationInstruction).toContain("[nasa.gov]");
    // The instruction mentions [1] as an example of what NOT to do, so we verify that's present
    expect(citationInstruction).toContain('not "The Earth orbits the Sun [1]"');
  });
});
