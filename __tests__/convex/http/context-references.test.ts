import { describe, expect, it, vi } from "vitest";
import { sanitizeContextReferences } from "../../../convex/http/routes/aiAgent";

describe("sanitizeContextReferences", () => {
  it("filters and normalizes valid context references", () => {
    vi.useFakeTimers();
    const now = Date.now();
    vi.setSystemTime(now);

    const result = sanitizeContextReferences([
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        type: "search_result",
        url: "https://example.com/article",
        title: "Example Article",
        timestamp: 12345,
        relevanceScore: 0.9,
        metadata: { foo: "bar" },
      },
      {
        contextId: "invalid", // invalid because missing type
      },
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b41",
        type: "scraped_page",
        title: "Another",
      },
    ]);

    expect(result).toEqual([
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        type: "search_result",
        url: "https://example.com/article",
        title: "Example Article",
        timestamp: 12345,
        relevanceScore: 0.9,
        metadata: { foo: "bar" },
      },
      {
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b41",
        type: "scraped_page",
        title: "Another",
        timestamp: now,
      },
    ]);

    vi.useRealTimers();
  });

  it("limits to 12 entries and trims strings", () => {
    const oversizedTitle = "x".repeat(1000);
    const oversizedUrl = `https://example.com/${"y".repeat(5000)}`;

    const refs = Array.from({ length: 20 }, (_, i) => ({
      contextId: `019a122e-c507-7851-99f7-b8f5d7345b${(40 + i).toString(16).padStart(2, "0")}`,
      type: "search_result" as const,
      title: oversizedTitle,
      url: oversizedUrl,
    }));

    const result = sanitizeContextReferences(refs);

    expect(result).toBeDefined();
    expect(result).toHaveLength(12);
    expect(result?.[0]?.title?.length).toBeLessThanOrEqual(500);
    expect(result?.[0]?.url?.length).toBeLessThanOrEqual(2000);
  });

  it("returns undefined for non-arrays", () => {
    expect(sanitizeContextReferences(null)).toBeUndefined();
    expect(sanitizeContextReferences({})).toBeUndefined();
    expect(sanitizeContextReferences("invalid")).toBeUndefined();
  });
});
