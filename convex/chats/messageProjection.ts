/**
 * Shared message-to-client projection
 *
 * Transforms a raw message document into the validated shape returned by
 * getChatMessages, getChatMessagesHttp, and getChatMessagesPaginated.
 * Single source of truth for the client-facing message contract.
 */

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import type { DatabaseReader } from "../_generated/server";
import type { WebResearchSource } from "../lib/validators";
import { vWebResearchSource } from "../lib/validators";
import {
  normalizeReasoningValue,
  resolveMessageTimestamp,
} from "./messageNormalization";
import { resolveWebResearchSourcesFromMessage } from "./webResearchSourcesResolver";

/**
 * Convex return-type validator for the client-facing message shape.
 * Single source of truth — used by getChatMessages, getChatMessagesHttp, etc.
 */
export const vMessageProjection = v.object({
  _id: v.id("messages"),
  _creationTime: v.number(),
  chatId: v.id("chats"),
  role: v.union(v.literal("user"), v.literal("assistant"), v.literal("system")),
  content: v.optional(v.string()),
  timestamp: v.optional(v.number()),
  isStreaming: v.optional(v.boolean()),
  streamedContent: v.optional(v.string()),
  thinking: v.optional(v.string()),
  reasoning: v.optional(v.string()),
  webResearchSources: v.optional(v.array(vWebResearchSource)),
  workflowId: v.optional(v.string()),
  imageStorageIds: v.optional(v.array(v.id("_storage"))),
});

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
  imageStorageIds?: Id<"_storage">[];
}

/** Project a raw message doc into the client-facing shape. */
export function projectMessage(m: Doc<"messages">): MessageProjection {
  const webResearchSources = resolveWebResearchSourcesFromMessage(m);
  const timestamp = resolveMessageTimestamp(m);
  return {
    _id: m._id,
    _creationTime: m._creationTime,
    chatId: m.chatId,
    role: m.role,
    content: m.content,
    timestamp,
    isStreaming: m.isStreaming,
    streamedContent: m.streamedContent,
    thinking: m.thinking,
    reasoning: normalizeReasoningValue(m.reasoning),
    webResearchSources:
      webResearchSources.length > 0 ? webResearchSources : undefined,
    workflowId: m.workflowId,
    imageStorageIds: m.imageStorageIds,
  };
}

/** Validate that an optional limit arg is positive. */
function assertPositiveLimit(limit: number | undefined): void {
  if (
    limit !== undefined &&
    (!Number.isFinite(limit) || !Number.isInteger(limit) || limit <= 0)
  ) {
    throw new Error("limit must be a positive number");
  }
}

/**
 * Fetch messages for a chat in chronological order.
 * When limit is specified, fetches the most recent N messages
 * by querying desc and reversing to keep memory bounded.
 */
export async function fetchMessagesByChatId(
  db: DatabaseReader,
  chatId: Id<"chats">,
  limit?: number,
): Promise<Doc<"messages">[]> {
  assertPositiveLimit(limit);
  if (limit) {
    const descDocs = await db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .order("desc")
      .take(limit);
    return descDocs.reverse();
  }
  return db
    .query("messages")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .order("asc")
    .collect();
}
