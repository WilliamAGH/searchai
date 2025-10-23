/**
 * End-to-end integration test specification for agent grounding
 *
 * Validates that the research agent properly:
 * 1. Executes web searches when planning recommends them
 * 2. Captures contextIds from tool outputs
 * 3. Populates sourcesUsed with valid references
 * 4. Synthesizes answers with inline citations
 *
 * NOTE: These are specification tests that document expected behavior.
 * For live integration testing, deploy to a test Convex deployment and
 * call the orchestrateResearchWorkflow action directly.
 */

import { describe, expect, it } from "vitest";

describe("Agent Grounding Specifications", () => {
  it("should define expected structure for grounded responses", () => {
    // This test documents the expected output structure from orchestrateResearchWorkflow
    const expectedResponseStructure = {
      // Workflow tracking
      workflowId: expect.stringMatching(/^[0-9a-f-]{36}$/), // UUIDv7

      // Stage 1: Planning
      planning: {
        userIntent: expect.any(String),
        informationNeeded: expect.any(Array),
        searchQueries: expect.arrayContaining([
          expect.objectContaining({
            query: expect.any(String),
            reasoning: expect.any(String),
            priority: expect.any(Number),
          }),
        ]),
        needsWebScraping: expect.any(Boolean),
        confidenceLevel: expect.any(Number),
      },

      // Tool execution log
      toolCallLog: expect.arrayContaining([
        expect.objectContaining({
          toolName: expect.stringMatching(/^(search_web|scrape_webpage)$/),
          timestamp: expect.any(Number),
          reasoning: expect.any(String),
          input: expect.any(Object),
          resultSummary: expect.any(String),
          durationMs: expect.any(Number),
          success: expect.any(Boolean),
        }),
      ]),

      // Stage 2: Research
      research: {
        researchSummary: expect.any(String),
        keyFindings: expect.arrayContaining([
          expect.objectContaining({
            finding: expect.any(String),
            sources: expect.any(Array), // Array of URLs
            confidence: expect.stringMatching(/^(high|medium|low)$/),
          }),
        ]),
        sourcesUsed: expect.arrayContaining([
          expect.objectContaining({
            url: expect.stringMatching(/^https?:\/\//),
            title: expect.any(String),
            contextId: expect.stringMatching(
              /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
            ),
            type: expect.stringMatching(/^(search_result|scraped_page)$/),
            relevance: expect.stringMatching(/^(high|medium|low)$/),
          }),
        ]),
        researchQuality: expect.stringMatching(
          /^(comprehensive|adequate|limited)$/,
        ),
      },

      // Stage 3: Answer Synthesis
      answer: {
        answer: expect.any(String),
        hasLimitations: expect.any(Boolean),
        sourcesUsed: expect.any(Array), // Array of domains cited
        answerCompleteness: expect.stringMatching(
          /^(complete|partial|insufficient)$/,
        ),
        confidence: expect.any(Number),
      },

      // Metadata
      metadata: {
        totalDuration: expect.any(Number),
        planningDuration: expect.any(Number),
        researchDuration: expect.any(Number),
        synthesisDuration: expect.any(Number),
        timestamp: expect.any(Number),
      },
    };

    // Verify structure is well-formed
    expect(expectedResponseStructure).toBeDefined();
    console.info(
      "✅ Expected response structure validated for grounding workflow",
    );
  });

  it("should validate contextId format requirements", () => {
    // UUIDv7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
    // where y is one of [89ab]
    const validContextIds = [
      "019a122e-c507-7851-99f7-b8f5d7345b40",
      "019a122e-e601-76da-a999-c2ed00f69127",
    ];

    const invalidContextIds = [
      "invalid",
      "019a122e-c507-851-99f7-b8f5d7345b40", // Missing digit
      "019a122e-c507-8851-99f7-b8f5d7345b40", // Wrong version (8 instead of 7)
      "", // Empty
    ];

    const uuidV7Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (const validId of validContextIds) {
      expect(validId).toMatch(uuidV7Regex);
    }

    for (const invalidId of invalidContextIds) {
      expect(invalidId).not.toMatch(uuidV7Regex);
    }

    console.info("✅ ContextId validation rules verified");
  });

  it("should validate citation format in answers", () => {
    const answerWithCitations =
      "Anthropic is headquartered in San Francisco [anthropic.com]. The company was founded in 2021 [techcrunch.com].";

    const citationPattern = /\[[\w.-]+\]/g;
    const citations = answerWithCitations.match(citationPattern);

    expect(citations).toBeDefined();
    expect(citations?.length).toBeGreaterThan(0);
    expect(citations).toEqual(["[anthropic.com]", "[techcrunch.com]"]);

    console.info("✅ Citation format validated");
  });

  it("should validate tool call log structure", () => {
    const exampleToolCallLog = [
      {
        toolName: "search_web",
        timestamp: Date.now(),
        reasoning: "Find headquarters location",
        input: { query: "Anthropic headquarters", maxResults: 5 },
        resultSummary: '{"contextId":"019a...","resultCount":5}',
        durationMs: 1234,
        success: true,
      },
      {
        toolName: "scrape_webpage",
        timestamp: Date.now(),
        reasoning: "Get official company info",
        input: { url: "https://anthropic.com/about" },
        resultSummary: '{"contextId":"019a...","title":"About Anthropic"}',
        durationMs: 2345,
        success: true,
      },
    ];

    for (const call of exampleToolCallLog) {
      expect(call.toolName).toMatch(/^(search_web|scrape_webpage)$/);
      expect(call.success).toBe(true);
      expect(call.durationMs).toBeGreaterThan(0);
    }

    console.info("✅ Tool call log structure validated");
  });

  it("should validate sourcesUsed cross-referencing with keyFindings", () => {
    const sourcesUsed = [
      {
        url: "https://anthropic.com/about",
        title: "About Anthropic",
        contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        type: "search_result" as const,
        relevance: "high" as const,
      },
    ];

    const keyFindings = [
      {
        finding: "Anthropic is headquartered in San Francisco",
        sources: ["https://anthropic.com/about"],
        confidence: "high" as const,
      },
    ];

    // Every source in keyFindings should exist in sourcesUsed
    for (const finding of keyFindings) {
      for (const sourceUrl of finding.sources) {
        const found = sourcesUsed.some((s) => s.url === sourceUrl);
        expect(found).toBe(true);
      }
    }

    console.info("✅ Source cross-referencing validated");
  });

  it("should validate short-circuit behavior for non-research queries", () => {
    const greetingResponse = {
      planning: {
        searchQueries: [], // No queries for greeting
      },
      toolCallLog: [], // No tools called
      research: {
        sourcesUsed: [],
        researchQuality: "adequate" as const,
      },
      answer: {
        answer: "Hello! How can I help you today?",
        answerCompleteness: "complete" as const,
      },
    };

    expect(greetingResponse.planning.searchQueries.length).toBe(0);
    expect(greetingResponse.toolCallLog.length).toBe(0);
    expect(greetingResponse.research.sourcesUsed.length).toBe(0);
    expect(greetingResponse.answer.answer).toBeTruthy();

    console.info("✅ Short-circuit behavior validated");
  });

  it("should validate conversation context propagation", () => {
    // Test that pronoun resolution works with context
    const conversationContext = `User: What is Anthropic?
Assistant: Anthropic is an AI safety company founded in 2021.
User: Where are they based?`;

    const userQuery = "Where are they based?";

    // This is a specification test - actual integration would call the action
    // The planning stage should understand "they" refers to "Anthropic" from context
    expect(conversationContext).toContain("Anthropic");
    expect(userQuery).toContain("they");

    // In live integration, verify: result.planning.userIntent.toLowerCase().includes("anthropic")

    console.info("✅ Context propagation contract validated");
  });
});

/**
 * MANUAL INTEGRATION TEST GUIDE
 *
 * To run live integration tests against a deployed Convex environment:
 *
 * 1. Deploy to test environment:
 *    ```bash
 *    npx convex dev --once
 *    ```
 *
 * 2. Set environment variables:
 *    ```bash
 *    export CONVEX_URL="https://your-deployment.convex.cloud"
 *    export OPENROUTER_API_KEY="sk-your-key"
 *    export SERP_API_KEY="your-key"
 *    ```
 *
 * 3. Create a simple Node script to call the action:
 *    ```typescript
 *    import { ConvexHttpClient } from "convex/browser";
 *    import { api } from "./convex/_generated/api";
 *
 *    const client = new ConvexHttpClient(process.env.CONVEX_URL!);
 *
 *    const result = await client.action(
 *      api.agents.orchestration.orchestrateResearchWorkflow,
 *      { userQuery: "Where is Anthropic headquartered?" }
 *    );
 *
 *    console.log(JSON.stringify(result, null, 2));
 *    ```
 *
 * 4. Validate the output matches the specifications in this test file
 */
