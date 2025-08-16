/**
 * MSW Integration Verification Test
 * Confirms that MSW is properly intercepting and mocking search API calls
 */

import { describe, it, expect, beforeEach } from "vitest";
import {
  setSearchTestScenario,
  SEARCH_TEST_SCENARIOS,
  searchTestHelper,
} from "../mocks/search-api-mocks";

describe("MSW Search API Mocking Verification", () => {
  beforeEach(() => {
    // Reset to standard scenario before each test
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.STANDARD);
    searchTestHelper.reset();
  });

  it("should intercept and mock fetch requests to search APIs", async () => {
    // Test that MSW is intercepting fetch calls
    const response = await fetch("https://serpapi.com/search?q=test&num=5");

    expect(response.ok).toBe(true);
    const data = await response.json();

    // Should return mocked data structure
    expect(data).toHaveProperty("organic_results");
    expect(Array.isArray(data.organic_results)).toBe(true);
  });

  it("should return different responses based on test scenario", async () => {
    // Test standard scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.STANDARD);
    const standardResponse = await fetch(
      "https://serpapi.com/search?q=React+hooks&num=2",
    );
    const standardData = await standardResponse.json();
    expect(standardData.organic_results).toHaveLength(2);
    expect(standardData.organic_results[0].title).toContain("React");

    // Test no results scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.NO_RESULTS);
    const noResultsResponse = await fetch(
      "https://serpapi.com/search?q=test&num=5",
    );
    const noResultsData = await noResultsResponse.json();
    expect(noResultsData.organic_results).toHaveLength(0);

    // Test error scenario
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.ERROR);
    const errorResponse = await fetch(
      "https://serpapi.com/search?q=test&num=5",
    );
    expect(errorResponse.ok).toBe(false);
    expect(errorResponse.status).toBe(500);
  });

  it("should mock OpenRouter API for search planning", async () => {
    const plannerRequest = {
      model: "meta-llama/llama-3.2-3b-instruct:free",
      messages: [
        {
          role: "system",
          content: "You are a search planner",
        },
        {
          role: "user",
          content: "New message: What is React?",
        },
      ],
    };

    const response = await fetch(
      "https://openrouter.ai/api/v1/chat/completions",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(plannerRequest),
      },
    );

    expect(response.ok).toBe(true);
    const data = await response.json();

    expect(data).toHaveProperty("choices");
    expect(data.choices[0]).toHaveProperty("message");

    // Parse the planner response
    const plannerResponse = JSON.parse(data.choices[0].message.content);
    expect(plannerResponse).toHaveProperty("shouldSearch");
    expect(plannerResponse).toHaveProperty("queries");
  });

  it("should mock DuckDuckGo JSON responses", async () => {
    const response = await fetch(
      "https://api.duckduckgo.com/?q=test&format=json",
    );

    expect(response.ok).toBe(true);
    const data = await response.json();

    // Should return DuckDuckGo JSON format
    expect(data).toHaveProperty("Abstract");
    expect(data).toHaveProperty("AbstractURL");
    expect(data).toHaveProperty("Heading");
    expect(data).toHaveProperty("RelatedTopics");
    expect(data.RelatedTopics).toBeInstanceOf(Array);
    expect(data.Heading).toContain('Result 1 for "test"');
  });

  it("should track API calls with test helper", async () => {
    // Reset helper
    searchTestHelper.reset();

    // Make some API calls
    await fetch("https://serpapi.com/search?q=test1");
    searchTestHelper.recordCall("serp", "test1", { results: [] });

    await fetch("https://openrouter.ai/api/v1/chat/completions", {
      method: "POST",
      body: JSON.stringify({ messages: [] }),
    });
    searchTestHelper.recordCall("openrouter", "plan", { plan: {} });

    // Verify tracking
    expect(searchTestHelper.getCallCount()).toBe(2);
    expect(searchTestHelper.getCallCount("serp")).toBe(1);
    expect(searchTestHelper.getCallCount("openrouter")).toBe(1);

    const lastCall = searchTestHelper.getLastCall();
    expect(lastCall?.provider).toBe("openrouter");
  });

  it("should return creator-specific results for William Callahan queries", async () => {
    const response = await fetch(
      "https://serpapi.com/search?q=William+Callahan",
    );
    const data = await response.json();

    expect(data.organic_results.length).toBeGreaterThan(0);
    expect(data.organic_results[0].link).toBe("https://williamcallahan.com");
    expect(data.organic_results[0].snippet).toContain("SearchAI.io");
  });

  it("should return technical documentation for React queries", async () => {
    const response = await fetch("https://serpapi.com/search?q=React+hooks");
    const data = await response.json();

    expect(data.organic_results.length).toBeGreaterThan(0);
    const reactDocs = data.organic_results.filter((r: any) =>
      r.link.includes("react.dev"),
    );
    expect(reactDocs.length).toBeGreaterThan(0);
  });
});

describe("MSW Error Simulation", () => {
  it("should simulate rate limiting", async () => {
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.RATE_LIMITED);

    const response = await fetch("https://serpapi.com/search?q=test");
    expect(response.status).toBe(429);
  });

  it("should simulate timeout scenario", async () => {
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.TIMEOUT);

    // This should timeout (but we'll set a short timeout for the test)
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 100);

    try {
      await fetch("https://serpapi.com/search?q=test", {
        signal: controller.signal,
      });
      expect.fail("Should have timed out");
    } catch (error: any) {
      expect(error.name).toBe("AbortError");
    } finally {
      clearTimeout(timeoutId);
    }
  });

  it("should return partial results", async () => {
    setSearchTestScenario(SEARCH_TEST_SCENARIOS.PARTIAL_RESULTS);

    const response = await fetch("https://serpapi.com/search?q=test&num=5");
    const data = await response.json();

    // Should return only 1 result despite asking for 5
    expect(data.organic_results).toHaveLength(1);
  });
});
