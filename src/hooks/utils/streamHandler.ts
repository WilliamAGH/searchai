import { Dispatch, SetStateAction } from "react";
import { ChatState } from "../useChatState";
import {
  StreamChunk,
  UnifiedMessage,
  PersistedPayload,
} from "../../lib/types/unified";
import { logger } from "../../lib/logger";
import { updateLastAssistantMessage } from "./messageStateUpdaters";

/**
 * Handles processing of stream events for the chat UI.
 * Encapsulates the state accumulation and UI updates during streaming.
 */
export class StreamEventHandler {
  private fullContent = "";
  private accumulatedReasoning = "";
  private persistedDetails: PersistedPayload | null = null;
  private persistedConfirmed = false;

  constructor(
    private setState: Dispatch<SetStateAction<ChatState>>,
    private chatId: string,
  ) {}

  public getPersistedConfirmed(): boolean {
    return this.persistedConfirmed;
  }

  public getPersistedDetails(): PersistedPayload | null {
    return this.persistedDetails;
  }

  public getFullContent(): string {
    return this.fullContent;
  }

  public handle(chunk: StreamChunk): void {
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
    if (chunk.type === "chunk") {
      // Legacy support for simple text chunks
      this.handleContent({ type: "content", content: chunk.content });
      return;
    }
    if (chunk.type === "metadata") {
      this.handleMetadata(chunk);
      return;
    }
    if (chunk.type === "error") {
      throw new Error(chunk.error);
    }
    if (chunk.type === "done" || chunk.type === "complete") {
      this.handleComplete();
      return;
    }
    if (chunk.type === "persisted") {
      this.handlePersisted(chunk);
      return;
    }
  }

  private handleProgress(chunk: Extract<StreamChunk, { type: "progress" }>) {
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

  private handleReasoning(chunk: Extract<StreamChunk, { type: "reasoning" }>) {
    this.accumulatedReasoning += chunk.content;
    updateLastAssistantMessage(this.setState, {
      reasoning: this.accumulatedReasoning,
      thinking: "Thinking...",
    });
    logger.debug("Reasoning chunk received");
  }

  private handleContent(chunk: {
    type: "content" | "chunk";
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
            message: "Writing answer...",
          },
        },
      );
    }
  }

  private handleMetadata(chunk: Extract<StreamChunk, { type: "metadata" }>) {
    if (chunk.metadata && typeof chunk.metadata === "object") {
      const metadata = chunk.metadata as Record<string, unknown>;
      const workflowIdFromMetadata = metadata.workflowId as string | undefined;
      const contextRefs = Array.isArray(metadata.contextReferences)
        ? (metadata.contextReferences as UnifiedMessage["contextReferences"])
        : undefined;
      const metadataSources = Array.isArray(metadata.sources)
        ? (metadata.sources as string[])
        : undefined;
      const searchResults = contextRefs
        ? contextRefs.map((ref) => ({
            title:
              ref.title || (ref.url ? new URL(ref.url).hostname : "Unknown"),
            url: ref.url || "",
            snippet: "",
            relevanceScore: ref.relevanceScore ?? 0.5,
            kind: ref.type,
          }))
        : metadata.searchResults || [];

      // Cast searchResults to any to bypass strict UnifiedMessage type check for now
      // This is safe because the UI handles these fields flexibly
      const messageUpdates: Partial<UnifiedMessage> = {
        isStreaming: true,
        thinking: undefined,
        searchResults: searchResults as any,
      };
      if (workflowIdFromMetadata !== undefined) {
        messageUpdates.workflowId = workflowIdFromMetadata;
      }
      const nonce = (chunk as { nonce?: string }).nonce;
      if (nonce !== undefined) {
        messageUpdates.workflowNonce = nonce;
      }
      if (contextRefs !== undefined) {
        messageUpdates.contextReferences = contextRefs;
      }
      if (metadataSources !== undefined) {
        messageUpdates.sources = metadataSources;
      }
      updateLastAssistantMessage(this.setState, messageUpdates);
    }
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

  private handlePersisted(chunk: Extract<StreamChunk, { type: "persisted" }>) {
    this.persistedConfirmed = true;
    this.persistedDetails = chunk.payload;

    const persistedSearchResults = chunk.payload.contextReferences
      ?.filter((ref) => ref && typeof ref.url === "string")
      .map((ref) => ({
        title: ref.title || ref.url || "Unknown",
        url: ref.url || "",
        snippet: "",
        relevanceScore: ref.relevanceScore ?? 0.5,
        kind: ref.type,
      }));

    // Cast searchResults to any here as well
    const messageUpdates: Partial<UnifiedMessage> = {
      workflowId: chunk.payload.workflowId,
      sources: chunk.payload.sources,
      contextReferences: chunk.payload.contextReferences,
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
    if (persistedSearchResults !== undefined) {
      messageUpdates.searchResults = persistedSearchResults as any;
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
