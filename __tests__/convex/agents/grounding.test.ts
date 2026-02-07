/**
 * SSE grounding contract specifications for agent workflows.
 *
 * These tests document the canonical streaming contract consumed by the UI:
 * workflow_start -> progress/reasoning/content -> metadata -> complete -> persisted.
 */

import { describe, expect, it } from "vitest";
import { WebResearchSourceSchema } from "../../../convex/schemas/webResearchSources";

describe("Agent SSE Grounding Specifications", () => {
  it("documents canonical SSE event ordering", () => {
    const expectedSequence = [
      "workflow_start",
      "progress",
      "reasoning",
      "content",
      "metadata",
      "complete",
      "persisted",
    ];

    expect(expectedSequence.indexOf("workflow_start")).toBe(0);
    expect(expectedSequence.indexOf("metadata")).toBeLessThan(
      expectedSequence.indexOf("complete"),
    );
    expect(expectedSequence.indexOf("complete")).toBeLessThan(
      expectedSequence.indexOf("persisted"),
    );
  });

  it("validates workflow_start payload shape", () => {
    const workflowStartEvent = {
      type: "workflow_start",
      workflowId: "019a122e-c507-7851-99f7-b8f5d7345b40",
      nonce: "019a122e-c507-7851-99f7-b8f5d7345b41",
    };

    const uuidV7Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    expect(workflowStartEvent.type).toBe("workflow_start");
    expect(workflowStartEvent.workflowId).toMatch(uuidV7Regex);
    expect(workflowStartEvent.nonce).toMatch(uuidV7Regex);
  });

  it("validates progress event shape", () => {
    const progressEvent = {
      type: "progress",
      stage: "searching",
      message: "Finding sources...",
      toolReasoning: "Need fresh web results for this claim",
      toolQuery: "Anthropic latest funding round",
    };

    expect(progressEvent.type).toBe("progress");
    expect(progressEvent.stage).toMatch(
      /^(thinking|planning|searching|scraping|analyzing|generating|finalizing)$/,
    );
    expect(progressEvent.message.length).toBeGreaterThan(0);
  });

  it("validates reasoning and content chunk contract", () => {
    const reasoningEvent = {
      type: "reasoning",
      content: "I should verify this with primary sources.",
    };

    const contentEvent = {
      type: "content",
      delta: "Anthropic is headquartered in San Francisco",
    };

    expect(reasoningEvent.type).toBe("reasoning");
    expect(reasoningEvent.content.length).toBeGreaterThan(0);

    expect(contentEvent.type).toBe("content");
    expect(contentEvent.delta.length).toBeGreaterThan(0);
  });

  it("validates metadata and complete event relationship", () => {
    const metadataEvent = {
      type: "metadata",
      metadata: {
        workflowId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        webResearchSources: [],
        hasLimitations: false,
        confidence: 0.87,
        answerLength: 512,
      },
      nonce: "019a122e-c507-7851-99f7-b8f5d7345b41",
    };

    const completeEvent = {
      type: "complete",
      workflow: {
        workflowId: "019a122e-c507-7851-99f7-b8f5d7345b40",
      },
    };

    expect(metadataEvent.type).toBe("metadata");
    expect(metadataEvent.metadata.workflowId).toBe(
      completeEvent.workflow.workflowId,
    );
    expect(metadataEvent.metadata.answerLength).toBeGreaterThan(0);
  });

  it("validates persisted event payload and signature fields", () => {
    const webResearchSource = {
      contextId: "019a122e-c507-7851-99f7-b8f5d7345b42",
      type: "search_result",
      url: "https://www.anthropic.com/",
      title: "Anthropic",
      relevanceScore: 0.95,
      timestamp: Date.now(),
    };

    const persistedEvent = {
      type: "persisted",
      payload: {
        assistantMessageId: "k17acj6k6we1r7d8q0gpb7m4d57n2x1v",
        workflowId: "019a122e-c507-7851-99f7-b8f5d7345b40",
        answer: "Anthropic is headquartered in San Francisco.",
        webResearchSources: [webResearchSource],
      },
      nonce: "019a122e-c507-7851-99f7-b8f5d7345b41",
      signature: "deadbeef",
    };

    expect(persistedEvent.type).toBe("persisted");
    expect(persistedEvent.payload.workflowId).toBeTruthy();
    expect(persistedEvent.payload.assistantMessageId).toBeTruthy();
    expect(persistedEvent.payload.answer.length).toBeGreaterThan(0);
    expect(persistedEvent.nonce.length).toBeGreaterThan(0);
    expect(persistedEvent.signature.length).toBeGreaterThan(0);
    expect(WebResearchSourceSchema.safeParse(webResearchSource).success).toBe(
      true,
    );
  });

  it("validates citation format in synthesized answers", () => {
    const answerWithCitations =
      "Anthropic is headquartered in San Francisco [anthropic.com]. The company was founded in 2021 [techcrunch.com].";

    const citationPattern = /\[[\w.-]+\]/g;
    const citations = answerWithCitations.match(citationPattern);

    expect(citations).toBeDefined();
    expect(citations?.length).toBeGreaterThan(0);
    expect(citations).toEqual(["[anthropic.com]", "[techcrunch.com]"]);
  });

  it("validates contextId format requirements", () => {
    const validContextIds = [
      "019a122e-c507-7851-99f7-b8f5d7345b40",
      "019a122e-e601-76da-a999-c2ed00f69127",
    ];

    const invalidContextIds = [
      "invalid",
      "019a122e-c507-851-99f7-b8f5d7345b40",
      "019a122e-c507-8851-99f7-b8f5d7345b40",
      "",
    ];

    const uuidV7Regex =
      /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

    for (const validId of validContextIds) {
      expect(validId).toMatch(uuidV7Regex);
    }

    for (const invalidId of invalidContextIds) {
      expect(invalidId).not.toMatch(uuidV7Regex);
    }
  });
});
