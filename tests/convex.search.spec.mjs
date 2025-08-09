// Minimal smoke tests for convex/search helpers (no external deps)
// Run with: npm test

import { searchWithDuckDuckGo } from "../convex/search.ts";

async function test_returnsPromise() {
  const label = "searchWithDuckDuckGo returns a Promise";
  const p = searchWithDuckDuckGo("test", 1);
  if (!(p instanceof Promise)) throw new Error(label);
  console.log(`✅ ${label}`);
}

(async () => {
  try {
    await test_returnsPromise();
  } catch (e) {
    console.error("❌ Test failed:", e);
    process.exit(1);
  }
})();





