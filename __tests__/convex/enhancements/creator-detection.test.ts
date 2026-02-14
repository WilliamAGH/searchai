import { describe, it, expect } from "vitest";
import { applyEnhancements } from "../../../convex/enhancements";

/**
 * Test the creator/Researchly/aVenture detection logic
 * Uses the actual applyEnhancements function to avoid logic duplication
 */
function detectCreatorQuery(userMessage: string): boolean {
  const result = applyEnhancements(userMessage, {
    enhanceContext: true,
  });
  // Check if creator-author rule matched
  return result.matchedRules.some((rule) => rule.id === "creator-author");
}

describe("creator detection", () => {
  describe("should match creator/founder queries", () => {
    const creatorQueries = [
      "Who is the creator of Researchly?",
      "Who made this app?",
      "Who built researchly.fyi?",
      "Tell me about the author of this website",
      "Who is behind Researchly?",
      "Who founded this service?",
      "Who developed researchly?",
      "What company is behind this tool?",
      "Who is William Callahan?",
      "Tell me about the founder of this site",
      "Who created this search tool?",
      "Who is the author behind researchly.fyi?",
      "Who's the creator of this search service?",
      "Tell me about william callahan",
      "Company behind Researchly",
      "Founder of researchly",
    ];

    for (const query of creatorQueries) {
      it(`matches: "${query}"`, () => {
        expect(detectCreatorQuery(query)).toBe(true);
      });
    }
  });

  describe("should match Researchly product queries", () => {
    const researchlyQueries = [
      "What is Researchly?",
      "Tell me about Researchly",
      "How does Researchly work?",
      "Explain researchly.fyi",
      "What does this app do?",
      "Describe this website",
      "What is researchly?",
      "Researchly features",
    ];

    for (const query of researchlyQueries) {
      it(`matches: "${query}"`, () => {
        expect(detectCreatorQuery(query)).toBe(true);
      });
    }
  });

  describe("should match aVenture queries", () => {
    const aventureQueries = [
      "What is aVenture?",
      "Tell me about aventure.vc",
      "What does aVenture do?",
      "aVenture investment firm",
      "Explain aVenture",
    ];

    for (const query of aventureQueries) {
      it(`matches: "${query}"`, () => {
        expect(detectCreatorQuery(query)).toBe(true);
      });
    }
  });

  describe("should NOT match unrelated queries", () => {
    const unrelatedQueries = [
      "How does this work?", // No app reference + no entity mention
      "Search for William Shakespeare",
      "Who created Google?",
      "The creator of the universe",
      "Author of Harry Potter",
      "Behind the scenes",
      "Company news",
      "Who is Elon Musk?",
      "Tell me about OpenAI",
      "What is a search engine?",
      "How to use this?",
      "What is the weather today?",
      "Who won the Super Bowl?",
    ];

    for (const query of unrelatedQueries) {
      it(`does not match: "${query}"`, () => {
        expect(detectCreatorQuery(query)).toBe(false);
      });
    }
  });

  it("enhances matched queries with correct info", () => {
    const testQueries = [
      "Who created Researchly?",
      "What is Researchly?",
      "Tell me about aVenture",
      "Who is William Callahan?",
    ];

    for (const query of testQueries) {
      const result = applyEnhancements(query, {
        enhanceQuery: true,
        enhanceContext: true,
        injectSearchResults: true,
      });

      expect(result.matchedRules.some((r) => r.id === "creator-author")).toBe(
        true,
      );
      expect(result.enhancedQuery).toContain("williamcallahan.com");
      expect(result.enhancedQuery).toContain("aventure.vc");
      expect(result.enhancedContext).toContain("William Callahan");
      expect(result.enhancedContext).toContain("Researchly");
      expect(result.enhancedContext).toContain("aVenture");
      expect(result.injectedResults.length).toBeGreaterThan(0);
      expect(
        result.injectedResults.some((r) => r.url.includes("researchly.fyi")),
      ).toBe(true);
    }
  });
});
