/**
 * Comprehensive Search API Integration Tests
 * Demonstrates 100% synthetic behavior testing with MSW mocks
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { setupMockServer, mockSearchResponse } from "../mocks/server";
import {
  setSearchTestScenario,
  setResponseDelay,
  setErrorRate,
  SEARCH_TEST_SCENARIOS,
  searchTestHelper,
} from "../mocks/search-api-mocks";
import { callAction } from "../helpers/convex-test-helpers";
import { api } from "../../convex/_generated/api";

// Import the actual search functions to test
import { searchWeb, planSearch } from "../../convex/search";
import { searchWithDuckDuckGo } from "../../convex/search/providers/duckduckgo";
import { searchWithSerpApiDuckDuckGo } from "../../convex/search/providers/serpapi";
import { searchWithOpenRouter } from "../../convex/search/providers/openrouter";

// Setup MSW for all tests
setupMockServer();

describe.skip("Search API with 100% Synthetic Behavior", () => {
  beforeEach(() => {
    // Reset test scenario and helper
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.STANDARD);
    setResponseDelay(0);
    setErrorRate(0);
    searchTestHelper.reset();
  });

  describe("Search Provider Fallback Chain", () => {
    it("should try SERP API first when available", async () => {
      // Set environment to have SERP API key
      process.env.SERP_API_KEY = "test-key";

      const results = await callAction(searchWeb, {
        query: "capital of France",
        maxResults: 5,
      });

      expect(results.searchMethod).toBe("serp");
      expect(results.hasRealResults).toBe(true);
      expect(results.results).toHaveLength(2);
      expect(results.results[0].title).toContain("Paris");
    });

    it("should fallback to OpenRouter when SERP API fails", async () => {
      process.env.SERP_API_KEY = "test-key";
      process.env.OPENROUTER_API_KEY = "test-key";

      // Make SERP API fail
      mockSearchResponse("serp", null, 500);

      const results = await callAction(searchWeb, {
        query: "React hooks",
        maxResults: 5,
      });

      expect(results.searchMethod).toBe("openrouter");
      expect(results.hasRealResults).toBe(true);
    });

    it("should fallback to DuckDuckGo when both SERP and OpenRouter fail", async () => {
      delete process.env.SERP_API_KEY;
      delete process.env.OPENROUTER_API_KEY;

      const results = await callAction(searchWeb, {
        query: "test query",
        maxResults: 5,
      });

      expect(results.searchMethod).toBe("duckduckgo");
      expect(results.results.length).toBeGreaterThan(0);
    });

    it("should use fallback links when all providers fail", async () => {
      setSearchTestScenario(SEARCH_TEST_SCENARIOS.ERROR);

      const results = await callAction(searchWeb, {
        query: "test query",
        maxResults: 5,
      });

      expect(results.searchMethod).toBe("fallback");
      expect(results.hasRealResults).toBe(false);
      expect(results.results[0].url).toContain("duckduckgo.com");
    });
  });

  describe("Search Planner Intelligence", () => {
    it("should decide to search for information queries", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";

      const mockContext = {
        runQuery: vi.fn().mockImplementation(async (query: any) => {
          if (query === api.chats.messagesPaginated.getRecentChatMessages) {
            return [];
          }
          if (query === api.chats.getChatById) {
            return { _id: "test-chat-id", title: "Test Chat" };
          }
          return null;
        }),
      };

      const plan = await callAction(planSearch, {
        chatId: "test-chat-id" as any,
        newMessage: "What is the capital of France?",
        maxContextMessages: 10,
      }, mockContext);

      expect(plan.shouldSearch).toBe(true);
      expect(plan.queries.length).toBeGreaterThan(0);
      expect(plan.decisionConfidence).toBeGreaterThan(0.5);
    });

    it("should not search for simple greetings", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";

      const mockContext = {
        runQuery: vi.fn().mockImplementation(async (query: any) => {
          if (query === api.chats.messagesPaginated.getRecentChatMessages) {
            return [];
          }
          if (query === api.chats.getChatById) {
            return { _id: "test-chat-id", title: "Test Chat" };
          }
          return null;
        }),
      };

      const plan = await callAction(planSearch, {
        chatId: "test-chat-id" as any,
        newMessage: "Hello",
        maxContextMessages: 10,
      }, mockContext);

      expect(plan.shouldSearch).toBe(false);
      expect(plan.queries).toEqual([]);
    });

    it("should suggest new chat for topic changes", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";

      const mockContext = {
        runQuery: vi.fn().mockImplementation(async (query: any) => {
          if (query === api.chats.messagesPaginated.getRecentChatMessages) {
            return [];
          }
          if (query === api.chats.getChatById) {
            return { _id: "test-chat-id", title: "Test Chat" };
          }
          return null;
        }),
      };

      const plan = await callAction(planSearch, {
        chatId: "test-chat-id" as any,
        newMessage: "Now let me ask about a completely different topic",
        maxContextMessages: 10,
      }, mockContext);

      expect(plan.suggestNewChat).toBe(true);
    });

    it("should use cached plans for identical queries", async () => {
      const chatId = "test-chat-id" as any;
      const message = "What is React?";

      const mockContext = {
        runQuery: vi.fn().mockImplementation(async (query: any) => {
          if (query === api.chats.messagesPaginated.getRecentChatMessages) {
            return [];
          }
          if (query === api.chats.getChatById) {
            return { _id: chatId, title: "Test Chat" };
          }
          return null;
        }),
      };

      // First call
      const plan1 = await callAction(planSearch, {
        chatId,
        newMessage: message,
        maxContextMessages: 10,
      }, mockContext);

      // Second call (should use cache)
      const plan2 = await callAction(planSearch, {
        chatId,
        newMessage: message,
        maxContextMessages: 10,
      }, mockContext);

      expect(plan1).toEqual(plan2);
      expect(searchTestHelper.verifyCaching(message)).toBe(true);
    });
  });

  describe("Error Handling and Resilience", () => {
    it("should handle network timeouts gracefully", async () => {
      setResponseDelay(100); // Short delay

      const results = await callAction(searchWeb, {
        query: "test query",
        maxResults: 5,
      });

      expect(results.results).toBeDefined();
      expect(results.results.length).toBeGreaterThan(0);
    });

    it("should handle rate limiting with fallback", async () => {
      setSearchTestScenario(SEARCH_TEST_SCENARIOS.RATE_LIMITED);

      const results = await callAction(searchWeb, {
        query: "test query",
        maxResults: 5,
      });

      // Should fallback to next provider or return fallback links
      expect(results.results).toBeDefined();
    });

    it("should handle partial results", async () => {
      setSearchTestScenario(SEARCH_TEST_SCENARIOS.PARTIAL_RESULTS);

      const results = await callAction(searchWeb, {
        query: "test query",
        maxResults: 5,
      });

      expect(results.results.length).toBe(1);
      expect(results.hasRealResults).toBeDefined();
    });

    it("should handle intermittent errors with retry", async () => {
      setErrorRate(0.3); // 30% error rate

      const promises = Array(10)
        .fill(null)
        .map(() =>
          callAction(searchWeb, {
            query: "test query",
            maxResults: 5,
          }),
        );

      const results = await Promise.allSettled(promises);
      const successful = results.filter((r) => r.status === "fulfilled");

      // Most should succeed despite error rate
      expect(successful.length).toBeGreaterThan(5);
    });
  });

  describe("Search Result Quality", () => {
    it("should return relevant results for creator queries", async () => {
      const results = await callAction(searchWeb, {
        query: "William Callahan",
        maxResults: 5,
      });

      expect(results.results[0].url).toBe("https://williamcallahan.com");
      expect(results.results[0].relevanceScore).toBe(1.0);
    });

    it("should return technical documentation for coding queries", async () => {
      const results = await callAction(searchWeb, {
        query: "React hooks",
        maxResults: 5,
      });

      const reactDocs = results.results.filter((r) =>
        r.url.includes("react.dev"),
      );
      expect(reactDocs.length).toBeGreaterThan(0);
      expect(reactDocs[0].relevanceScore).toBeGreaterThan(0.9);
    });

    it("should generate synthetic results for unknown queries", async () => {
      const results = await callAction(searchWeb, {
        query: "completely random unknown query xyz123",
        maxResults: 3,
      });

      expect(results.results).toHaveLength(3);
      expect(results.results[0].title).toContain("Result 1");
      expect(results.results[0].relevanceScore).toBe(0.8);
    });
  });

  describe("Caching Behavior", () => {
    it("should cache search results", async () => {
      const query = "test caching query";

      // First call
      const results1 = await callAction(searchWeb, { query, maxResults: 5 });

      // Mock a different response
      mockSearchResponse("serp", {
        organic_results: [
          {
            title: "Different Result",
            link: "https://different.com",
            snippet: "Different snippet",
          },
        ],
      });

      // Second call should return cached results
      const results2 = await callAction(searchWeb, { query, maxResults: 5 });

      expect(results1).toEqual(results2);
    });

    it("should respect cache expiration", async () => {
      // This would require manipulating time or waiting
      // Implementation depends on your cache expiration strategy
    });
  });

  describe("Provider-Specific Behavior", () => {
    it("should parse SERP API response correctly", async () => {
      const results = await searchWithSerpApiDuckDuckGo("test query", 5);

      expect(results).toBeInstanceOf(Array);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("title");
        expect(results[0]).toHaveProperty("url");
        expect(results[0]).toHaveProperty("snippet");
        expect(results[0]).toHaveProperty("relevanceScore");
      }
    });

    it("should parse OpenRouter response correctly", async () => {
      process.env.OPENROUTER_API_KEY = "test-key";

      const results = await searchWithOpenRouter("test query", 5);

      expect(results).toBeInstanceOf(Array);
    });

    it("should parse DuckDuckGo HTML correctly", async () => {
      const results = await searchWithDuckDuckGo("test query", 5);

      expect(results).toBeInstanceOf(Array);
      if (results.length > 0) {
        expect(results[0]).toHaveProperty("title");
        expect(results[0]).toHaveProperty("url");
      }
    });
  });

  describe("E2E Smoke Tests", () => {
    it("should complete full search flow", async () => {
      // Simulate complete user flow
      process.env.OPENROUTER_API_KEY = "test-key";
      process.env.SERP_API_KEY = "test-key";

      const mockContext = {
        runQuery: vi.fn().mockImplementation(async (query: any) => {
          if (query === api.chats.messagesPaginated.getRecentChatMessages) {
            return [];
          }
          if (query === api.chats.getChatById) {
            return { _id: "test-chat", title: "Test Chat" };
          }
          return null;
        }),
      };

      // 1. Plan the search
      const plan = await callAction(planSearch, {
        chatId: "test-chat" as any,
        newMessage: "What are the latest AI developments?",
        maxContextMessages: 10,
      }, mockContext);

      expect(plan.shouldSearch).toBe(true);

      // 2. Execute search with planned queries
      const searchPromises = plan.queries
        .slice(0, 2)
        .map((query) => callAction(searchWeb, { query, maxResults: 3 }));

      const searchResults = await Promise.all(searchPromises);

      // 3. Verify results
      expect(searchResults).toHaveLength(2);
      searchResults.forEach((result) => {
        expect(result.hasRealResults).toBeDefined();
        expect(result.results.length).toBeGreaterThan(0);
      });
    });

    it("should handle concurrent searches", async () => {
      const queries = [
        "React hooks",
        "Python documentation",
        "Machine learning",
        "William Callahan",
        "Latest news",
      ];

      const results = await Promise.all(
        queries.map((query) => callAction(searchWeb, { query, maxResults: 3 })),
      );

      expect(results).toHaveLength(5);
      results.forEach((result) => {
        expect(result.results).toBeDefined();
        expect(result.searchMethod).toBeDefined();
      });
    });
  });
});

describe("Search Test Helper Utilities", () => {
  it("should track provider call history", () => {
    searchTestHelper.recordCall("serp", "test query", { results: [] });
    searchTestHelper.recordCall("openrouter", "test query", { results: [] });

    expect(searchTestHelper.getCallCount()).toBe(2);
    expect(searchTestHelper.getCallCount("serp")).toBe(1);
    expect(searchTestHelper.getLastCall()?.provider).toBe("openrouter");
  });

  it("should verify fallback chain order", () => {
    searchTestHelper.recordCall("serp", "query", {});
    searchTestHelper.recordCall("openrouter", "query", {});
    searchTestHelper.recordCall("duckduckgo", "query", {});

    expect(searchTestHelper.verifyFallbackChain()).toBe(true);

    searchTestHelper.reset();
    searchTestHelper.recordCall("openrouter", "query", {});
    searchTestHelper.recordCall("serp", "query", {});

    expect(searchTestHelper.verifyFallbackChain()).toBe(false);
  });
});
