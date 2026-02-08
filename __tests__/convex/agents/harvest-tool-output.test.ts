import { describe, it, expect } from "vitest";
import { harvestToolOutput } from "../../../convex/agents/streaming_processor_helpers";
import { createEmptyHarvestedData } from "../../../convex/schemas/agents";

const validSearchOutput = {
  contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
  query: "test query",
  reasoning: "test reasoning",
  resultCount: 1,
  searchMethod: "serp",
  hasRealResults: true,
  timestamp: Date.now(),
  results: [
    {
      url: "https://example.com/a",
      title: "Example A",
      snippet: "Snippet for A",
      relevanceScore: 0.9,
    },
  ],
};

const validScrapeOutput = {
  contextId: "019a122e-c507-7851-99f7-b8f5d7345b41",
  url: "https://example.com/page",
  reasoning: "test reasoning",
  title: "Test Page",
  content: "Page content here",
  summary: "Test summary",
  contentLength: 17,
  scrapedAt: Date.now(),
};

describe("harvestToolOutput", () => {
  it("harvests search results for search_web tool", () => {
    const harvested = createEmptyHarvestedData();
    harvestToolOutput(validSearchOutput, "search_web", harvested);
    expect(harvested.searchResults.length).toBe(1);
    expect(harvested.searchResults[0].url).toBe("https://example.com/a");
  });

  it("harvests scraped content for scrape_webpage tool", () => {
    const harvested = createEmptyHarvestedData();
    harvestToolOutput(validScrapeOutput, "scrape_webpage", harvested);
    expect(harvested.scrapedContent.length).toBe(1);
    expect(harvested.scrapedContent[0].url).toBe("https://example.com/page");
  });

  it("does NOT harvest search results for unknown tool with 'results' field", () => {
    const harvested = createEmptyHarvestedData();
    const output = { results: [{ url: "https://x.com", title: "X" }] };
    harvestToolOutput(output, "analyze_data", harvested);
    expect(harvested.searchResults.length).toBe(0);
  });

  it("does NOT harvest search results for scrape_webpage even with 'results'", () => {
    const harvested = createEmptyHarvestedData();
    const output = { ...validScrapeOutput, results: [] };
    harvestToolOutput(output, "scrape_webpage", harvested);
    expect(harvested.searchResults.length).toBe(0);
    // But scrape should still be harvested
    expect(harvested.scrapedContent.length).toBe(1);
  });

  it("ignores non-record output", () => {
    const harvested = createEmptyHarvestedData();
    harvestToolOutput(null, "search_web", harvested);
    harvestToolOutput("string", "search_web", harvested);
    harvestToolOutput(42, "search_web", harvested);
    expect(harvested.searchResults.length).toBe(0);
    expect(harvested.scrapedContent.length).toBe(0);
  });
});
