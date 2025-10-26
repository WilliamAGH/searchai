import { describe, it, expect } from "vitest";
import {
  convertToContextReferences,
  buildUrlContextMap,
  extractContextIdFromOutput,
  normalizeUrl,
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
