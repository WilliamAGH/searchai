import { Dispatch, SetStateAction } from "react";
import { ChatState } from "@/hooks/useChatState";
import type { Message, MessageStreamChunk } from "@/lib/types/message";
import type { StreamingPersistPayload } from "../../../convex/schemas/agents";
import { logger } from "@/lib/logger";
import { updateLastAssistantMessage } from "@/hooks/utils/messageStateUpdaters";

/**
 * Handles processing of stream events for the chat UI.
 * Encapsulates the state accumulation and UI updates during streaming.
 */
export class StreamEventHandler {
  private fullContent = "";
  private accumulatedReasoning = "";
  private persistedDetails: StreamingPersistPayload | null = null;
  private persistedConfirmed = false;
  private workflowId: string | null = null;
  private workflowNonce: string | null = null;

  constructor(
    private setState: Dispatch<SetStateAction<ChatState>>,
    private chatId: string,
  ) {}

  public getPersistedConfirmed(): boolean {
    return this.persistedConfirmed;
  }

  public getPersistedDetails(): StreamingPersistPayload | null {
    return this.persistedDetails;
  }

  public getFullContent(): string {
    return this.fullContent;
  }

  public getWorkflowId(): string | null {
    return this.workflowId;
  }

  public getWorkflowNonce(): string | null {
    return this.workflowNonce;
  }

  public handle(chunk: MessageStreamChunk): void {
    if (chunk.type === "workflow_start") {
      this.handleWorkflowStart(chunk);
      return;
    }
    if (chunk.type === "progress") {
      this.handleProgress(chunk);
      return;
    }
    if (chunk.type === "reasoning") {
      this.handleReasoning(chunk);
      return;
    }
    if (chunk.type === "content") {
      this.handleContent(chunk);
      return;
    }
    if (chunk.type === "metadata") {
      this.handleMetadata(chunk);
      return;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error);
    }
    if (chunk.type === "complete") {
      this.handleComplete();
      return;
    }
    if (chunk.type === "persisted") {
      this.handlePersisted(chunk);
      return;
    }
  }

  private handleProgress(
    chunk: Extract<MessageStreamChunk, { type: "progress" }>,
  ) {
    this.setState((prev) => ({
      ...prev,
      searchProgress: {
        stage: chunk.stage,
        message: chunk.message,
        urls: chunk.urls,
        currentUrl: chunk.currentUrl,
        queries: chunk.queries,
        sourcesUsed: chunk.sourcesUsed,
        toolReasoning: chunk.toolReasoning,
        toolQuery: chunk.toolQuery,
        toolUrl: chunk.toolUrl,
      },
    }));
    logger.debug("Progress update:", chunk.stage, chunk.message, {
      toolReasoning: chunk.toolReasoning,
      toolQuery: chunk.toolQuery,
    });
  }

  private handleWorkflowStart(
    chunk: Extract<MessageStreamChunk, { type: "workflow_start" }>,
  ) {
    this.workflowId = chunk.workflowId;
    this.workflowNonce = chunk.nonce;

    // Update the last assistant message with workflow tracking info
    updateLastAssistantMessage(this.setState, {
      workflowId: chunk.workflowId,
      workflowNonce: chunk.nonce,
    });

    logger.debug("Workflow started", {
      chatId: this.chatId,
      workflowId: chunk.workflowId,
    });
  }

  private handleReasoning(
    chunk: Extract<MessageStreamChunk, { type: "reasoning" }>,
  ) {
    this.accumulatedReasoning += chunk.content;
    updateLastAssistantMessage(this.setState, {
      reasoning: this.accumulatedReasoning,
      thinking: "Thinking...",
    });
    logger.debug("Reasoning chunk received");
  }

  private handleContent(chunk: {
    type: "content";
    content?: string;
    delta?: string;
  }) {
    const delta = chunk.delta || chunk.content;
    if (delta) {
      this.fullContent += delta;
      updateLastAssistantMessage(
        this.setState,
        { content: this.fullContent, isStreaming: true },
        {
          searchProgress: {
            stage: "generating",
            message: "your answer...",
          },
        },
      );
    }
  }

  private handleMetadata(
    chunk: Extract<MessageStreamChunk, { type: "metadata" }>,
  ) {
    const metadata = chunk.metadata;
    const webResearchSources = metadata.webResearchSources;

    const messageUpdates: Partial<Message> = {
      isStreaming: true,
      thinking: undefined,
    };
    if (metadata.workflowId !== undefined) {
      messageUpdates.workflowId = metadata.workflowId;
    }
    if (chunk.nonce !== undefined) {
      messageUpdates.workflowNonce = chunk.nonce;
    }
    if (webResearchSources !== undefined) {
      messageUpdates.webResearchSources = webResearchSources;
    }
    updateLastAssistantMessage(this.setState, messageUpdates);
    logger.debug("Metadata received");
  }

  private handleComplete() {
    updateLastAssistantMessage(
      this.setState,
      { isStreaming: true, thinking: undefined },
      {
        searchProgress: {
          stage: "finalizing",
          message: "Saving and securing results...",
        },
      },
    );
    logger.debug("Stream complete, awaiting persisted event...");
  }

  private handlePersisted(
    chunk: Extract<MessageStreamChunk, { type: "persisted" }>,
  ) {
    this.persistedConfirmed = true;
    this.persistedDetails = chunk.payload;

    const messageUpdates: Partial<Message> = {
      workflowId: chunk.payload.workflowId,
      webResearchSources: chunk.payload.webResearchSources,
      isStreaming: false,
      thinking: undefined,
      persisted: true,
    };

    if (chunk.nonce !== undefined) {
      messageUpdates.workflowNonce = chunk.nonce;
    }
    if (chunk.signature !== undefined) {
      messageUpdates.workflowSignature = chunk.signature;
    }
    updateLastAssistantMessage(this.setState, messageUpdates, {
      isGenerating: false,
      searchProgress: { stage: "idle" },
    });

    logger.debug("Persistence confirmed via SSE", {
      chatId: this.chatId,
      workflowId: chunk.payload.workflowId,
    });
  }
}
