// Minimal smoke tests for convex/search helpers (no external deps)
// Run with: npm test

import {
  __extractKeywordsForTest as extractKW,
  __augmentQueryForTest as augmentQ,
} from "../convex/search.ts";

import { searchWithDuckDuckGo } from "../convex/search/providers/duckduckgo.ts";

async function test_returnsPromise() {
  const label = "searchWithDuckDuckGo returns a Promise";
  const p = searchWithDuckDuckGo("test", 1);
  if (!(p instanceof Promise)) throw new Error(label);
  console.info(`✅ ${label}`);
}

(async () => {
  try {
    await test_returnsPromise();
    // Heuristic unit tests
    const kw = extractKW(
      "OpenAI function calling with structured outputs in TypeScript and React apps. OpenAI functions TypeScript React.",
      4,
    );
    if (!Array.isArray(kw) || kw.length === 0)
      throw new Error("extractKW failed");
    const aug = augmentQ("function calling", kw, 3);
    if (!aug.toLowerCase().includes("function") || aug.split(" ").length <= 2)
      throw new Error("augmentQ failed");
    console.info("✅ Keyword extraction and augmentation heuristics work");
  } catch (e) {
    console.error("❌ Test failed:", e);
    process.exit(1);
  }
})();
