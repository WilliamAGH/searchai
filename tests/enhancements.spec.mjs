// Comprehensive tests for the message enhancement system
// Run with: npm test

import { applyEnhancements } from "../convex/enhancements.ts";

/**
 * Test data for various enhancement rules
 */
const testCases = [
  // Creator/Author tests
  {
    query: "Who created SearchAI?",
    expectedRules: ["creator-author"],
    expectEnhancedQuery: true,
    expectInjectedResults: true,
    description: "Should detect creator query"
  },
  {
    query: "Who is William Callahan?",
    expectedRules: ["creator-author"],
    expectEnhancedQuery: true,
    expectInjectedResults: true,
    description: "Should detect direct William Callahan mention"
  },
  
  // Technical documentation tests
  {
    query: "How to install React hooks?",
    expectedRules: ["technical-docs", "coding"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance technical documentation query"
  },
  {
    query: "Python API documentation",
    expectedRules: ["technical-docs", "coding"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance Python docs query"
  },
  
  // Current events tests
  {
    query: "Latest news about AI",
    expectedRules: ["current-events"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance current events query"
  },
  {
    query: "Recent updates in technology",
    expectedRules: ["current-events"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should add recency to tech news"
  },
  
  // Academic research tests
  {
    query: "Research papers on machine learning",
    expectedRules: ["academic"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance academic query"
  },
  {
    query: "Peer reviewed studies on climate change",
    expectedRules: ["academic"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should add scholarly sources"
  },
  
  // Comparison tests
  {
    query: "React vs Vue comparison",
    expectedRules: ["comparison", "coding"],  // React triggers coding rule too
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance comparison query"
  },
  {
    query: "What's better Python or JavaScript?",
    expectedRules: ["comparison", "coding"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should detect comparison and coding"
  },
  
  // Local information tests
  {
    query: "Coffee shops near me",
    expectedRules: ["local"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance local query"
  },
  {
    query: "Best restaurants in San Francisco",
    expectedRules: ["local"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should detect SF location"
  },
  
  // Coding tests
  {
    query: "Debug TypeError in JavaScript",
    expectedRules: ["coding"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance coding debug query"
  },
  {
    query: "Python function examples",
    expectedRules: ["technical-docs", "coding"],  // "example" triggers docs rule
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should add Stack Overflow to Python query"
  },
  
  // Health tests
  {
    query: "Symptoms of common cold",
    expectedRules: ["health"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance health query with reputable sources"
  },
  {
    query: "Treatment options for headaches",
    expectedRules: ["health"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should add medical sites to health query"
  },
  
  // Multiple rule matches
  {
    query: "Latest research papers on COVID-19 treatment",
    expectedRules: ["current-events", "academic", "health"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should match multiple enhancement rules"
  },
  {
    query: "How to debug React hooks tutorial",
    expectedRules: ["technical-docs", "coding"],
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should enhance with docs and coding sites"
  },
  
  // No matches (actually matches current-events due to "today")
  {
    query: "What is the weather today?",
    expectedRules: ["current-events"],  // "today" triggers current events
    expectEnhancedQuery: true,
    expectInjectedResults: false,
    description: "Should match current events due to 'today'"
  },
  {
    query: "Hello world",
    expectedRules: [],
    expectEnhancedQuery: false,
    expectInjectedResults: false,
    description: "Simple greeting should not trigger enhancements"
  }
];

/**
 * Test the enhancement system
 */
async function runEnhancementTests() {
  console.log("Testing message enhancement system...\n");
  console.log("=".repeat(60));
  
  let passed = 0;
  let failed = 0;
  const failures = [];
  
  for (const testCase of testCases) {
    const result = applyEnhancements(testCase.query, {
      enhanceQuery: true,
      enhanceSearchTerms: true,
      injectSearchResults: true,
      enhanceContext: true,
      enhanceSystemPrompt: true
    });
    
    // Check matched rules
    const matchedRuleIds = result.matchedRules.map(r => r.id);
    const expectedRuleIds = testCase.expectedRules;
    
    const rulesMatch = 
      matchedRuleIds.length === expectedRuleIds.length &&
      expectedRuleIds.every(id => matchedRuleIds.includes(id));
    
    // Check if query was enhanced
    const queryEnhanced = result.enhancedQuery !== testCase.query;
    const queryEnhancedCorrect = queryEnhanced === testCase.expectEnhancedQuery;
    
    // Check if results were injected
    const hasInjectedResults = result.injectedResults.length > 0;
    const injectedCorrect = hasInjectedResults === testCase.expectInjectedResults;
    
    const testPassed = rulesMatch && queryEnhancedCorrect && injectedCorrect;
    
    if (testPassed) {
      passed++;
      console.log(`✅ ${testCase.description}`);
      console.log(`   Query: "${testCase.query}"`);
      console.log(`   Matched rules: [${matchedRuleIds.join(", ")}]`);
    } else {
      failed++;
      failures.push(testCase);
      console.log(`❌ ${testCase.description}`);
      console.log(`   Query: "${testCase.query}"`);
      console.log(`   Expected rules: [${expectedRuleIds.join(", ")}]`);
      console.log(`   Got rules: [${matchedRuleIds.join(", ")}]`);
      if (!queryEnhancedCorrect) {
        console.log(`   Query enhancement: expected ${testCase.expectEnhancedQuery}, got ${queryEnhanced}`);
      }
      if (!injectedCorrect) {
        console.log(`   Injected results: expected ${testCase.expectInjectedResults}, got ${hasInjectedResults}`);
      }
    }
  }
  
  console.log("\n" + "=".repeat(60));
  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${testCases.length} tests`);
  
  if (failed > 0) {
    console.error("\n❌ Failed test cases:");
    failures.forEach(tc => {
      console.error(`  - "${tc.query}" (${tc.description})`);
    });
    throw new Error(`${failed} test(s) failed`);
  }
  
  console.log("\n✅ All enhancement tests passed!");
}

/**
 * Test priority ordering
 */
async function testPriorityOrdering() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing enhancement priority ordering...\n");
  
  // Query that matches multiple rules
  const query = "Who created this app and what's the latest documentation?";
  const result = applyEnhancements(query, {
    enhanceQuery: true,
    enhanceSearchTerms: true,
    injectSearchResults: true,
    enhanceContext: true,
    enhanceSystemPrompt: true
  });
  
  // Check that creator rule (priority 1) comes before others
  const matchedRules = result.matchedRules;
  if (matchedRules.length > 1) {
    const creatorIndex = matchedRules.findIndex(r => r.id === "creator-author");
    const otherIndices = matchedRules
      .filter(r => r.id !== "creator-author")
      .map(r => matchedRules.indexOf(r));
    
    const creatorFirst = otherIndices.every(idx => creatorIndex < idx);
    
    if (creatorFirst) {
      console.log(`✅ Priority ordering correct: creator rule processed first`);
    } else {
      console.error(`❌ Priority ordering incorrect`);
      throw new Error("Priority ordering test failed");
    }
  }
  
  console.log("\n✅ Priority ordering tests passed!");
}

/**
 * Test URL prioritization
 */
async function testUrlPrioritization() {
  console.log("\n" + "=".repeat(60));
  console.log("Testing URL prioritization...\n");
  
  const query = "Who is the founder of SearchAI?";
  const result = applyEnhancements(query, {
    enhanceQuery: true,
    enhanceSearchTerms: true,
    injectSearchResults: true,
    enhanceContext: true,
    enhanceSystemPrompt: true
  });
  
  // Check that William Callahan's URLs are prioritized
  const expectedUrls = ["https://williamcallahan.com", "https://aventure.vc"];
  const hasPrioritizedUrls = expectedUrls.every(url => 
    result.prioritizedUrls.some(p => p.includes(url))
  );
  
  if (hasPrioritizedUrls) {
    console.log(`✅ URL prioritization correct for creator query`);
    console.log(`   Prioritized URLs: ${result.prioritizedUrls.join(", ")}`);
  } else {
    console.error(`❌ URL prioritization failed`);
    console.error(`   Expected to prioritize: ${expectedUrls.join(", ")}`);
    console.error(`   Got: ${result.prioritizedUrls.join(", ")}`);
    throw new Error("URL prioritization test failed");
  }
  
  console.log("\n✅ URL prioritization tests passed!");
}

/**
 * Main test runner
 */
(async () => {
  try {
    await runEnhancementTests();
    await testPriorityOrdering();
    await testUrlPrioritization();
    console.log("\n" + "=".repeat(60));
    console.log("✅ All enhancement system tests completed successfully!");
  } catch (error) {
    console.error("\n❌ Test suite failed:", error.message);
    process.exit(1);
  }
})();