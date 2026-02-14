import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import {
  extractKeywordsForTest as extractKW,
  augmentQueryForTest as augmentQ,
} from "../../../convex/search/utils";
import { searchWithDuckDuckGo } from "../../../convex/search/providers/duckduckgo.ts";

// Prevent live network calls in restricted environments by stubbing fetch
beforeAll(() => {
  if (typeof globalThis.fetch !== "function") {
    globalThis.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({}),
    })) as unknown as typeof fetch;
  }
  vi.stubGlobal(
    "fetch",
    // Minimal Response-like stub used by providers
    vi.fn(async () => ({
      ok: true,
      json: async () => ({ results: [] }),
    })) as unknown as typeof fetch,
  );
});

afterAll(() => {
  vi.unstubAllGlobals();
});

describe("convex/search helpers", () => {
  it("searchWithDuckDuckGo returns a Promise", async () => {
    const p = searchWithDuckDuckGo("test", 1);
    expect(p instanceof Promise).toBe(true);
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
