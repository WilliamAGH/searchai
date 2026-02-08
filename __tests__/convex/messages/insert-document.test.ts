import { describe, expect, it } from "vitest";
import {
  buildMessageInsertDocument,
  type PersistableMessageArgs,
} from "../../../convex/messages_insert_document";

describe("buildMessageInsertDocument", () => {
  it("builds a persisted document from allowed fields", () => {
    const args: PersistableMessageArgs = {
      role: "assistant",
      content: "hello",
      isStreaming: false,
      streamedContent: "hello",
      thinking: "thought",
      reasoning: "reason",
      searchMethod: "serp",
      hasRealResults: true,
      webResearchSources: [
        {
          contextId: "ctx_1",
          type: "search_result",
          url: "https://example.com/",
          title: "Example",
          timestamp: 1700000000000,
          relevanceScore: 0.95,
        },
      ],
      workflowId: "workflow_1",
    };

    const result = buildMessageInsertDocument({
      chatId: "chat_1",
      messageId: "msg_1",
      threadId: "thread_1",
      args,
      timestamp: 1700000000001,
    });

    expect(result).toEqual({
      chatId: "chat_1",
      messageId: "msg_1",
      threadId: "thread_1",
      role: "assistant",
      content: "hello",
      isStreaming: false,
      streamedContent: "hello",
      thinking: "thought",
      reasoning: "reason",
      searchMethod: "serp",
      hasRealResults: true,
      webResearchSources: [
        {
          contextId: "ctx_1",
          type: "search_result",
          url: "https://example.com/",
          title: "Example",
          timestamp: 1700000000000,
          relevanceScore: 0.95,
        },
      ],
      workflowId: "workflow_1",
      timestamp: 1700000000001,
    });
  });

  it("omits undefined optional fields", () => {
    const result = buildMessageInsertDocument({
      chatId: "chat_2",
      messageId: "msg_2",
      threadId: "thread_2",
      args: {
        role: "user",
      },
      timestamp: 1700000000002,
    });

    expect(result).toEqual({
      chatId: "chat_2",
      messageId: "msg_2",
      threadId: "thread_2",
      role: "user",
      timestamp: 1700000000002,
    });
  });

  it("does not persist transport-only fields when args contain extras", () => {
    const argsWithTransportFields: PersistableMessageArgs & {
      workflowTokenId: string;
      sessionId: string;
    } = {
      role: "assistant",
      content: "transport test",
      workflowId: "workflow_2",
      workflowTokenId: "token_1",
      sessionId: "session_1",
    };

    const result = buildMessageInsertDocument({
      chatId: "chat_3",
      messageId: "msg_3",
      threadId: "thread_3",
      args: argsWithTransportFields,
      timestamp: 1700000000003,
    });

    expect(result).toEqual({
      chatId: "chat_3",
      messageId: "msg_3",
      threadId: "thread_3",
      role: "assistant",
      content: "transport test",
      workflowId: "workflow_2",
      timestamp: 1700000000003,
    });

    expect("workflowTokenId" in result).toBe(false);
    expect("sessionId" in result).toBe(false);
  });

  it("normalizes persisted webResearchSources URLs", () => {
    const result = buildMessageInsertDocument({
      chatId: "chat_4",
      messageId: "msg_4",
      threadId: "thread_4",
      args: {
        role: "assistant",
        webResearchSources: [
          {
            contextId: "ctx_2",
            type: "search_result",
            url: "chp.ca.gov/programs-services/programs/child-safety-seats/",
            title: "CHP",
            timestamp: 1700000000004,
          },
          {
            contextId: "ctx_3",
            type: "search_result",
            url: "javascript:alert(1)",
            title: "Bad",
            timestamp: 1700000000005,
          },
        ],
      },
    });

    expect(result.webResearchSources).toEqual([
      {
        contextId: "ctx_2",
        type: "search_result",
        url: "https://chp.ca.gov/programs-services/programs/child-safety-seats/",
        title: "CHP",
        timestamp: 1700000000004,
      },
    ]);
  });
});
