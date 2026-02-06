/**
 * Shared message-to-client projection
 *
 * Transforms a raw message document into the validated shape returned by
 * getChatMessages, getChatMessagesHttp, and getChatMessagesPaginated.
 * Single source of truth for the client-facing message contract.
 */

import type { Doc, Id } from "../_generated/dataModel";
import type { WebResearchSource } from "../lib/validators";
import { resolveWebResearchSourcesFromMessage } from "./webResearchSourcesResolver";

export interface MessageProjection {
  _id: Id<"messages">;
  _creationTime: number;
  chatId: Id<"chats">;
  role: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;
  reasoning?: string;
  webResearchSources?: WebResearchSource[];
  workflowId?: string;
}

/** Project a raw message doc into the client-facing shape. */
export function projectMessage(m: Doc<"messages">): MessageProjection {
  const webResearchSources = resolveWebResearchSourcesFromMessage(m);
  return {
    _id: m._id,
    _creationTime: m._creationTime,
    chatId: m.chatId,
    role: m.role,
    content: m.content,
    timestamp: m.timestamp,
    isStreaming: m.isStreaming,
    streamedContent: m.streamedContent,
    thinking: m.thinking,
    reasoning: m.reasoning,
    webResearchSources:
      webResearchSources.length > 0 ? webResearchSources : undefined,
    workflowId: m.workflowId,
  };
}

/** Validate that an optional limit arg is positive. */
export function assertPositiveLimit(limit: number | undefined): void {
  if (limit !== undefined && limit <= 0) {
    throw new Error("limit must be a positive number");
  }
}
