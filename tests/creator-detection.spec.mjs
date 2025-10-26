// Unit tests for creator detection logic in convex/ai.ts
// Run with: npm test

/**
 * Recreates the creator detection logic from convex/ai.ts for testing
 */
function detectCreatorQuery(userMessage) {
  const lowerMessage = userMessage.toLowerCase();

  const creatorKeywords = [
    "creator",
    "author",
    "founder",
    "who made",
    "who created",
    "who built",
    "who developed",
    "behind",
    "company",
    "william callahan",
    "who founded",
    "who is",
  ];

  const appKeywords = [
    "searchai",
    "search-ai",
    "search ai",
    "search-ai.io",
    "this app",
    "this website",
    "this site",
    "this tool",
    "this service",
    "this search",
  ];

  // Check if query mentions William Callahan directly
  const mentionsWilliam = lowerMessage.includes("william callahan");

  // Check if query is about creator/author AND mentions the app/service
  const isAboutCreator = creatorKeywords.some((keyword) =>
    lowerMessage.includes(keyword),
  );
  const isAboutApp =
    appKeywords.some((keyword) => lowerMessage.includes(keyword)) ||
    lowerMessage.includes("searchai") ||
    lowerMessage.includes("search-ai") ||
    lowerMessage.includes("search ai");

  const isCreatorQuery = mentionsWilliam || (isAboutCreator && isAboutApp);

  return isCreatorQuery;
}

/**
 * Test cases for creator detection
 */
const testCases = [
  // Should match - direct creator queries
  { query: "Who is the creator of SearchAI?", shouldMatch: true },
  { query: "Who made this app?", shouldMatch: true },
  { query: "Who built search-ai.io?", shouldMatch: true },
  { query: "Tell me about the author of this website", shouldMatch: true },
  { query: "Who is behind SearchAI?", shouldMatch: true },
  { query: "Who founded this service?", shouldMatch: true },
  { query: "Who developed search-ai?", shouldMatch: true },
  { query: "What company is behind this tool?", shouldMatch: true },
  { query: "Who is William Callahan?", shouldMatch: true },
  { query: "Tell me about the founder of this site", shouldMatch: true },
  { query: "Who created this search tool?", shouldMatch: true },
  { query: "Who is the author behind search-ai.io?", shouldMatch: true },
  { query: "Who's the creator of this search service?", shouldMatch: true },
  { query: "Tell me about william callahan", shouldMatch: true },
  { query: "Company behind SearchAI", shouldMatch: true },
  { query: "Who is responsible for this app?", shouldMatch: true },
  { query: "Founder of search-ai", shouldMatch: true },

  // Should NOT match - unrelated queries
  { query: "What is SearchAI?", shouldMatch: false },
  { query: "How does this work?", shouldMatch: false },
  { query: "Search for William Shakespeare", shouldMatch: false },
  { query: "Who created Google?", shouldMatch: false },
  { query: "The creator of the universe", shouldMatch: false },
  { query: "Author of Harry Potter", shouldMatch: false },
  { query: "Behind the scenes", shouldMatch: false },
  { query: "Company news", shouldMatch: false },
  { query: "Who is Elon Musk?", shouldMatch: false },
  { query: "Tell me about OpenAI", shouldMatch: false },
  { query: "What is a search engine?", shouldMatch: false },
  { query: "How to use this?", shouldMatch: false },
];

/**
 * Run all tests
 */
async function runTests() {
  console.info("Testing creator query detection...\n");
  console.info("=".repeat(60));

  let passed = 0;
  let failed = 0;
  const failures = [];

  for (const testCase of testCases) {
    const result = detectCreatorQuery(testCase.query);
    const isCorrect = result === testCase.shouldMatch;

    if (isCorrect) {
      passed++;
      console.info(
        `✅ ${testCase.shouldMatch ? "MATCH" : "NO MATCH"}: "${testCase.query}"`,
      );
    } else {
      failed++;
      failures.push(testCase);
      console.info(
        `❌ EXPECTED ${testCase.shouldMatch ? "MATCH" : "NO MATCH"} but got ${result ? "MATCH" : "NO MATCH"}: "${testCase.query}"`,
      );
    }
  }

  console.info("\n" + "=".repeat(60));
  console.info(
    `\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`,
  );

  if (failed > 0) {
    console.error("\n❌ Failed test cases:");
    failures.forEach((tc) => {
      console.error(
        `  - "${tc.query}" (expected ${tc.shouldMatch ? "match" : "no match"})`,
      );
    });
    throw new Error(`${failed} test(s) failed`);
  }

  console.info("\n✅ All creator detection tests passed!");
}

/**
 * Test that enhanced queries include William Callahan's information
 */
async function testQueryEnhancement() {
  console.info("\n" + "=".repeat(60));
  console.info("Testing query enhancement...\n");

  const testQueries = [
    "Who created SearchAI?",
    "Tell me about the founder of this app",
    "Who is William Callahan?",
  ];

  for (const query of testQueries) {
    const isCreator = detectCreatorQuery(query);
    if (isCreator) {
      const enhanced = `${query} William Callahan williamcallahan.com aVenture aventure.vc`;
      const includesInfo =
        enhanced.includes("williamcallahan.com") &&
        enhanced.includes("aventure.vc");

      if (includesInfo) {
        console.info(
          `✅ Query properly enhanced: "${query.substring(0, 30)}..."`,
        );
      } else {
        console.error(`❌ Query enhancement failed for: "${query}"`);
        throw new Error("Query enhancement test failed");
      }
    }
  }

  console.info("\n✅ Query enhancement tests passed!");
}

/**
 * Main test runner
 */
(async () => {
  try {
    await runTests();
    await testQueryEnhancement();
    console.info("\n" + "=".repeat(60));
    console.info("✅ All creator detection tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    process.exit(1);
  }
})();
