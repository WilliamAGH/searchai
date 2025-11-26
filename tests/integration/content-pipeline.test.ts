import { describe, it, expect } from "vitest";
import {
  buildSynthesisInstructions,
  formatScrapedContentForPrompt,
} from "../../convex/agents/orchestration_helpers";

describe("content pipeline integration (prompt-side)", () => {
  it("includes scraped content excerpts in synthesis instructions", () => {
    const scrapedContent = [
      {
        url: "https://example.com/a",
        title: "Example A",
        content: "A".repeat(600),
        summary: "Summary A",
        contextId: "ctx-a",
        relevanceScore: 0.9,
      },
    ];

    const instructions = buildSynthesisInstructions({
      userQuery: "Test question",
      userIntent: "Find answer",
      researchSummary: "Summary",
      keyFindings: [
        {
          finding: "Fact",
          sources: ["https://example.com/a"],
          confidence: "high",
        },
      ],
      sourcesUsed: [
        {
          url: "https://example.com/a",
          title: "Example A",
          type: "scraped_page",
          relevance: "high",
        },
      ],
      scrapedContent,
    });

    expect(instructions).toContain("SCRAPED CONTENT");
    expect(instructions).toContain("https://example.com/a");
  });

  it("formats enrichment for prompts", () => {
    const formatted = formatScrapedContentForPrompt([
      {
        url: "https://example.com/b",
        title: "Example B",
        content: "B".repeat(1200),
        summary: "Summary B",
        contextId: "ctx-b",
        relevanceScore: 0.8,
      },
    ]);

    expect(formatted).toContain("Example B");
    expect(formatted).toContain("https://example.com/b");
  });
});
