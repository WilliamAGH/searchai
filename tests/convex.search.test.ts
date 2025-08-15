import { describe, it, expect } from "vitest";
import {
  __extractKeywordsForTest as extractKW,
  __augmentQueryForTest as augmentQ,
} from "../convex/search.ts";
import { searchWithDuckDuckGo } from "../convex/search/providers/duckduckgo.ts";

// MSW handles all fetch mocking - no need for vi.stubGlobal

describe("convex/search helpers", () => {
  it("searchWithDuckDuckGo returns a Promise", async () => {
    // MSW now handles the HTTP calls - no real network requests
    const p = searchWithDuckDuckGo("test", 1);
    expect(p instanceof Promise).toBe(true);

    // Let's also verify it resolves with mocked data
    const results = await p;
    expect(Array.isArray(results)).toBe(true);
    expect(results.length).toBeGreaterThan(0);
  });

  it("Keyword extraction and augmentation heuristics work", () => {
    const kw = extractKW(
      "OpenAI function calling with structured outputs in TypeScript and React apps. OpenAI functions TypeScript React.",
      4,
    );
    expect(Array.isArray(kw)).toBe(true);
    expect(kw.length).toBeGreaterThan(0);

    const aug = augmentQ("function calling", kw, 3);
    expect(aug.toLowerCase()).toContain("function");
    expect(aug.split(" ").length).toBeGreaterThan(2);
  });
});
