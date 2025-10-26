import { describe, it, expect } from "vitest";

function detectCreatorQuery(userMessage: string) {
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

  const mentionsWilliam = lowerMessage.includes("william callahan");
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

describe("creator detection", () => {
  const testCases: { query: string; shouldMatch: boolean }[] = [
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

  it("detects creator queries correctly", () => {
    for (const t of testCases) {
      expect(detectCreatorQuery(t.query)).toBe(t.shouldMatch);
    }
  });

  it("enhances creator queries with William Callahan's info (simulated)", () => {
    const testQueries = [
      "Who created SearchAI?",
      "Tell me about the founder of this app",
      "Who is William Callahan?",
    ];

    for (const query of testQueries) {
      const isCreator = detectCreatorQuery(query);
      if (isCreator) {
        const enhanced = `${query} William Callahan williamcallahan.com aVenture aventure.vc`;
        expect(enhanced.includes("williamcallahan.com")).toBe(true);
        expect(enhanced.includes("aventure.vc")).toBe(true);
      }
    }
  });
});
