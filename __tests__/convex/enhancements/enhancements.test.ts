import { describe, it, expect } from "vitest";
import { applyEnhancements } from "../../../convex/enhancements.ts";

describe("message enhancement system", () => {
  const cases = [
    {
      query: "Who created Researchly?",
      expectedRules: ["creator-author"],
      expectEnhancedQuery: true,
      expectInjectedResults: true,
      description: "Should detect creator query",
    },
    {
      query: "Who is William Callahan?",
      expectedRules: ["creator-author"],
      expectEnhancedQuery: true,
      expectInjectedResults: true,
      description: "Should detect direct William Callahan mention",
    },
    {
      query: "How to install React hooks?",
      expectedRules: ["technical-docs", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance technical documentation query",
    },
    {
      query: "Python API documentation",
      expectedRules: ["technical-docs", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance Python docs query",
    },
    {
      query: "Latest news about AI",
      expectedRules: ["current-events"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance current events query",
    },
    {
      query: "Recent updates in technology",
      expectedRules: ["current-events"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should add recency to tech news",
    },
    {
      query: "Research papers on machine learning",
      expectedRules: ["academic"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance academic query",
    },
    {
      query: "Peer reviewed studies on climate change",
      expectedRules: ["academic"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should add scholarly sources",
    },
    {
      query: "React vs Vue comparison",
      expectedRules: ["comparison", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance comparison query",
    },
    {
      query: "What's better Python or JavaScript?",
      expectedRules: ["comparison", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should detect comparison and coding",
    },
    {
      query: "Coffee shops near me",
      expectedRules: ["local"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance local query",
    },
    {
      query: "Best restaurants in San Francisco",
      expectedRules: ["local"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should detect SF location",
    },
    {
      query: "Debug TypeError in JavaScript",
      expectedRules: ["coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance coding debug query",
    },
    {
      query: "Python function examples",
      expectedRules: ["technical-docs", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should add Stack Overflow to Python query",
    },
    {
      query: "Symptoms of common cold",
      expectedRules: ["health"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance health query with reputable sources",
    },
    {
      query: "Treatment options for headaches",
      expectedRules: ["health"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should add medical sites to health query",
    },
    {
      query: "Latest research papers on COVID-19 treatment",
      expectedRules: ["current-events", "academic", "health"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should match multiple enhancement rules",
    },
    {
      query: "How to debug React hooks tutorial",
      expectedRules: ["technical-docs", "coding"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should enhance with docs and coding sites",
    },
    {
      query: "What is the weather today?",
      expectedRules: ["current-events"],
      expectEnhancedQuery: true,
      expectInjectedResults: false,
      description: "Should match current events due to 'today'",
    },
    {
      query: "Hello world",
      expectedRules: [],
      expectEnhancedQuery: false,
      expectInjectedResults: false,
      description: "Simple greeting should not trigger enhancements",
    },
  ];

  it("applies rules, query enhancement, and injected results correctly", () => {
    for (const t of cases) {
      const result = applyEnhancements(t.query, {
        enhanceQuery: true,
        enhanceSearchTerms: true,
        injectSearchResults: true,
        enhanceContext: true,
        enhanceSystemPrompt: true,
      });
      const matchedRuleIds = result.matchedRules.map((r) => r.id);
      const matchedSet = new Set(matchedRuleIds);
      const expectedSet = new Set(t.expectedRules);
      expect(matchedSet).toEqual(expectedSet);

      const queryEnhanced = result.enhancedQuery !== t.query;
      expect(queryEnhanced).toBe(t.expectEnhancedQuery);

      const hasInjected = result.injectedResults.length > 0;
      expect(hasInjected).toBe(t.expectInjectedResults);
    }
  });

  it("respects priority ordering (creator-author first when applicable)", () => {
    const query = "Who created this app and what's the latest documentation?";
    const result = applyEnhancements(query, {
      enhanceQuery: true,
      enhanceSearchTerms: true,
      injectSearchResults: true,
      enhanceContext: true,
      enhanceSystemPrompt: true,
    });
    const matched = result.matchedRules.map((r) => r.id);
    const creatorIdx = matched.indexOf("creator-author");
    // This query should always match creator-author and at least one other rule
    expect(creatorIdx).not.toBe(-1);
    expect(matched.length).toBeGreaterThan(1);
    // creator-author should be first (index 0) when present with other rules
    expect(creatorIdx).toBe(0);
  });

  it("prioritizes expected URLs for creator queries", () => {
    const result = applyEnhancements("Who is the founder of Researchly?", {
      enhanceQuery: true,
      enhanceSearchTerms: true,
      injectSearchResults: true,
      enhanceContext: true,
      enhanceSystemPrompt: true,
    });
    const expectedUrls = ["https://williamcallahan.com", "https://aventure.vc"];
    for (const url of expectedUrls) {
      expect(result.prioritizedUrls.some((u: string) => u.includes(url))).toBe(
        true,
      );
    }
  });
});
