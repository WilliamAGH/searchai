import { describe, it, expect } from "vitest";
import {
  convertToContextReferences,
  buildUrlContextMap,
  extractContextIdFromOutput,
  normalizeUrl,
  formatScrapedContentForPrompt,
  formatSerpEnrichmentForPrompt,
} from "../../convex/agents/orchestration_helpers";

// Helper: simple extractContextId and normalize wrappers for test determinism
const extractId = (o: any) =>
  o && typeof o === "object" ? (o.contextId ?? null) : null;
const norm = (u?: string) => (typeof u === "string" ? u : null);

describe("convertToContextReferences", () => {
  it("maps sourcesUsed to context references with derived relevanceScore", () => {
    const input = [
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        type: "search_result" as const,
        url: "https://example.com/a",
        title: "Example A",
        relevance: "high" as const,
      },
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b41",
        type: "scraped_page" as const,
        url: "https://example.com/b",
        title: "Example B",
        relevance: "medium" as const,
      },
    ];

    const out = convertToContextReferences(input);
    expect(out).toHaveLength(2);
    expect(out[0]).toMatchObject({
      contextId: input[0].contextId,
      type: input[0].type,
      url: input[0].url,
      title: input[0].title,
    });
    expect(typeof out[0].timestamp).toBe("number");
    expect(out[0].relevanceScore).toBeGreaterThan(0.8); // ~0.9 for 'high'
    expect(out[1].relevanceScore).toBeGreaterThan(0.6); // ~0.7 for 'medium'
  });
});

describe("buildUrlContextMap", () => {
  it("indexes URLs from search_web and scrape_webpage outputs to their contextId", () => {
    const entries = new Map<string, any>();
    entries.set("call1", {
      toolName: "search_web",
      output: {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b99",
        results: [
          { url: "https://example.com/x" },
          { url: "https://example.com/y" },
        ],
      },
    });
    entries.set("call2", {
      toolName: "scrape_webpage",
      output: {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345c00",
        url: "https://example.com/z",
      },
    });

    const map = buildUrlContextMap(entries as any, extractId, norm);
    expect(map.get("https://example.com/x")).toBe(
      "019a122e-c507-7851-99f7-b8f5d7345b99",
    );
    expect(map.get("https://example.com/y")).toBe(
      "019a122e-c507-7851-99f7-b8f5d7345b99",
    );
    expect(map.get("https://example.com/z")).toBe(
      "019a122e-c507-7851-99f7-b8f5d7345c00",
    );
  });
});

describe("formatScrapedContentForPrompt", () => {
  it("truncates and formats scraped content with ordering by relevance", () => {
    const formatted = formatScrapedContentForPrompt([
      {
        url: "https://example.com/low",
        title: "Low",
        content: "l".repeat(200),
        summary: "low summary",
        relevanceScore: 0.2,
      },
      {
        url: "https://example.com/high",
        title: "High",
        content: "h".repeat(400),
        summary: "high summary",
        relevanceScore: 0.9,
      },
    ]);

    expect(formatted).toContain("#1 High");
    expect(formatted).toContain("https://example.com/high");
    expect(formatted).toContain("Content (truncated");
  });
});

describe("formatSerpEnrichmentForPrompt", () => {
  it("prints knowledge graph and answer box data", () => {
    const formatted = formatSerpEnrichmentForPrompt({
      knowledgeGraph: {
        title: "Apple",
        type: "Company",
        description: "Maker of iPhone",
        attributes: { CEO: "Tim Cook" },
        url: "https://apple.com",
      },
      answerBox: {
        type: "direct_answer",
        answer: "Tim Cook",
        source: "Example",
        url: "https://example.com",
      },
      relatedSearches: ["apple ceo", "apple leadership"],
    });

    expect(formatted).toContain("Knowledge Graph: Apple");
    expect(formatted).toContain("Answer Box");
    expect(formatted).toContain("Related Searches");
  });
});
