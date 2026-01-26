/**
 * Convex Chat Repository Implementation
 * Handles chat operations for authenticated users using Convex backend
 */

import type { ConvexReactClient } from "convex/react";
import { z } from "zod/v4";
import { api } from "../../../convex/_generated/api";
import type { Doc, Id } from "../../../convex/_generated/dataModel";
import {
  StreamingPersistPayloadSchema,
  type StreamingPersistPayload,
} from "../../../convex/agents/schema";
import {
  BaseRepository,
  type SearchWebResponse,
} from "@/lib/repositories/ChatRepository";
import { IdUtils, TitleUtils } from "@/lib/types/unified";
import type { MessageStreamChunk } from "@/lib/types/message";
import { MessageMetadataSchema } from "@/lib/schemas/messageStream";
import { logger } from "@/lib/logger";
import { buildHttpError, readResponseBody } from "@/lib/utils/httpUtils";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import {
  parseSSEStream,
  isSSEParseError,
  type SSEEvent,
} from "@/lib/utils/sseParser";
import { MAX_LOOKUP_RETRIES, computeFastBackoff } from "@/lib/constants/retry";
import {
  verifyPersistedPayload,
  isSignatureVerificationAvailable,
} from "@/lib/security/signature";
import { env } from "@/lib/env";
// Removed unused imports from errorHandling

const ProgressEventSchema = z.object({
  type: z.literal("progress"),
  stage: z.enum([
    "thinking",
    "planning",
    "searching",
    "scraping",
    "analyzing",
    "generating",
  ]),
  message: z.string(),
  urls: z.array(z.string()).optional(),
  currentUrl: z.string().optional(),
  queries: z.array(z.string()).optional(),
  sourcesUsed: z.number().optional(),
  toolReasoning: z.string().optional(),
  toolQuery: z.string().optional(),
  toolUrl: z.string().optional(),
});

const ReasoningEventSchema = z.object({
  type: z.literal("reasoning"),
  content: z.string(),
});

const ContentEventSchema = z.object({
  type: z.literal("content"),
  content: z.string().optional(),
  delta: z.string().optional(),
});

const MetadataEventSchema = z.object({
  type: z.literal("metadata"),
  metadata: MessageMetadataSchema,
  nonce: z.string().optional(),
});

const ToolResultEventSchema = z.object({
  type: z.literal("tool_result"),
  toolName: z.string(),
  result: z.string(),
});

const ErrorEventSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
});

const PersistedEventSchema = z.object({
  type: z.literal("persisted"),
  payload: StreamingPersistPayloadSchema,
  nonce: z.string(),
  signature: z.string(),
});

export class ConvexChatRepository extends BaseRepository {
  protected storageType = "convex" as const;
  private client: ConvexReactClient;
  private sessionId?: string;

  constructor(client: ConvexReactClient, sessionId?: string) {
    super();
    this.client = client;
    this.sessionId = sessionId;

    // Log initialization for debugging
    logger.debug("ConvexChatRepository initialized", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  // Allow updating sessionId after creation
  setSessionId(sessionId: string | undefined) {
    this.sessionId = sessionId;
    logger.debug("ConvexChatRepository sessionId updated", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  /**
   * Get all chats for the current user.
   * @returns Array of chats (empty array if user has no chats)
   * @throws Error if fetch fails - caller must handle failure
   */
  async getChats(): Promise<Doc<"chats">[]> {
    // @ts-ignore - Convex api type instantiation is excessively deep [TS1c]
    const chats = await this.client.query(api.chats.getUserChats, {
      sessionId: this.sessionId,
    });
    return chats ?? [];
  }

  /**
   * Get a single chat by ID.
   * @param id - Chat ID (Convex ID or opaque ID)
   * @returns Doc<"chats"> if found, null if not found
   * @throws Error if fetch fails - caller must handle failure
   */
  async getChatById(id: string): Promise<Doc<"chats"> | null> {
    if (!IdUtils.isConvexId(id)) {
      // Try to find by opaque ID or share ID
      const byOpaque = await this.client.query(api.chats.getChatByOpaqueId, {
        opaqueId: id,
        sessionId: this.sessionId,
      });
      return byOpaque || null;
    }

    const chat = await this.client.query(api.chats.getChatById, {
      chatId: IdUtils.toConvexChatId(id),
      sessionId: this.sessionId,
    });

    return chat || null;
  }

  /**
   * Create a new chat.
   * @param title - Optional title for the chat
   * @returns Object with created chat and isNew flag
   * @throws Error if creation fails - caller must handle failure
   */
  async createChat(
    title?: string,
  ): Promise<{ chat: Doc<"chats">; isNew: boolean }> {
    try {
      const finalTitle = title || "New Chat";
      logger.debug("Creating chat", {
        title: finalTitle,
        sessionId: this.sessionId,
        hasSessionId: !!this.sessionId,
      });

      const chatId = await this.client.mutation(api.chats.createChat, {
        title: TitleUtils.sanitize(finalTitle),
        sessionId: this.sessionId,
      });

      logger.debug("Chat created with ID", {
        chatId,
        sessionId: this.sessionId,
      });

      // Use direct lookup with retry to handle index propagation delay
      const chat = await this.getChatByIdWithRetry(chatId);
      if (!chat) throw new Error("Failed to create chat");

      return { chat, isNew: true };
    } catch (error) {
      logger.error("Failed to create chat in Convex:", {
        error: getErrorMessage(error),
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Update the title of an existing chat.
   * @param id - Chat ID to update
   * @param title - New title for the chat
   * @throws Error if update fails - caller must handle failure
   */
  async updateChatTitle(id: string, title: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.updateChatTitle, {
        chatId: IdUtils.toConvexChatId(id),
        title: TitleUtils.sanitize(title),
      });
    } catch (error) {
      logger.error("Failed to update chat title in Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  /**
   * Update the privacy setting of a chat.
   * @param id - Chat ID to update
   * @param privacy - New privacy setting (private, shared, or public)
   * @throws Error if update fails - caller must handle failure
   */
  async updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<void> {
    try {
      await this.client.mutation(api.chats.updateChatPrivacy, {
        chatId: IdUtils.toConvexChatId(id),
        privacy,
      });
    } catch (error) {
      logger.error("Failed to update chat privacy in Convex:", {
        error: getErrorMessage(error),
        id,
        privacy,
      });
      throw error;
    }
  }

  /**
   * Delete a chat and all its messages.
   * @param id - Chat ID to delete
   * @throws Error if deletion fails - caller must handle failure
   */
  async deleteChat(id: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.deleteChat, {
        chatId: IdUtils.toConvexChatId(id),
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error("Failed to delete chat from Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  /**
   * Get all messages for a chat.
   * @param chatId - Chat ID to get messages for
   * @returns Array of messages (empty array if chat has no messages)
   * @throws Error if fetch fails - caller must handle failure
   */
  async getMessages(chatId: string): Promise<Doc<"messages">[]> {
    logger.debug("Fetching messages for chat", {
      chatId,
      sessionId: this.sessionId,
      hasSessionId: !!this.sessionId,
    });

    const messages = await this.client.query(api.chats.getChatMessages, {
      chatId: IdUtils.toConvexChatId(chatId),
      sessionId: this.sessionId,
    });

    // Convex queries return null for empty results, which is valid (not an error)
    const result = messages ?? [];

    logger.debug("Messages fetched successfully", {
      chatId,
      count: result.length,
    });

    return result;
  }

  /**
   * Get paginated messages for a chat.
   * Used for performance optimization in chats with many messages.
   * @param chatId - ID of the chat to get messages for
   * @param limit - Maximum number of messages to return (default: 50)
   * @param cursor - Pagination cursor for fetching next batch
   * @returns Object containing messages array, next cursor, and hasMore flag
   * @throws Error if fetch fails or returns invalid response
   */
  async getMessagesPaginated(
    chatId: string,
    limit = 50,
    cursor?: string | Id<"messages">,
  ): Promise<{
    messages: Doc<"messages">[];
    nextCursor?: Id<"messages">;
    hasMore: boolean;
  }> {
    const cursorId =
      cursor !== undefined
        ? IdUtils.toConvexMessageId(String(cursor))
        : undefined;
    const result = await this.client.query(
      api.chats.messagesPaginated.getChatMessagesPaginated,
      {
        chatId: IdUtils.toConvexChatId(chatId),
        limit,
        cursor: cursorId,
        sessionId: this.sessionId,
      },
    );

    // The paginated query should always return a valid result object.
    // A null result indicates an unexpected error condition.
    if (!result) {
      throw new Error(
        `Failed to fetch paginated messages for chat ${chatId}: received null response`,
      );
    }

    const nextCursor = result.nextCursor ?? undefined;

    const messages: Doc<"messages">[] = result.messages.map((msg) => ({
      ...msg,
      _creationTime: msg._creationTime ?? Date.now(),
      chatId: msg.chatId ?? IdUtils.toConvexChatId(chatId),
    }));

    return {
      messages,
      nextCursor,
      hasMore: result.hasMore,
    };
  }

  /**
   * Add a message to a chat.
   * @param chatId - Chat ID to add message to
   * @param message - Message data to add
   * @returns The created message
   * @throws Error - Direct message creation is not supported in Convex
   * @note For user messages in authenticated mode, use generateResponse flow
   */
  async addMessage(
    chatId: string,
    _message: Partial<Doc<"messages">>,
  ): Promise<Doc<"messages">> {
    // Direct message creation bypasses the agent workflow security model.
    // All messages should be created through generateResponse which handles
    // proper workflow tracking, signing, and persistence.
    throw new Error(
      `Direct message creation is not supported for chat ${chatId}. Use generateResponse instead.`,
    );
  }

  /**
   * Update a message's metadata.
   * @param id - Message ID to update
   * @param updates - Fields to update (searchResults, sources, searchMethod, hasRealResults)
   * @throws Error if update fails or no valid update fields provided
   * @note Content/reasoning updates are only allowed during streaming for security
   */
  async updateMessage(
    id: string,
    updates: Partial<Doc<"messages">>,
  ): Promise<void> {
    const hasMetadataUpdates =
      updates.searchResults !== undefined ||
      updates.sources !== undefined ||
      updates.searchMethod !== undefined ||
      updates.hasRealResults !== undefined;

    const hasContentUpdates =
      updates.content !== undefined || updates.reasoning !== undefined;

    // Reject content/reasoning updates - these must go through streaming
    if (hasContentUpdates) {
      throw new Error(
        "Direct content/reasoning updates are not supported. These are updated during streaming.",
      );
    }

    // Require at least one valid metadata field to update
    if (!hasMetadataUpdates) {
      throw new Error(
        `No valid update fields provided for message ${id}. ` +
          "Supported fields: searchResults, sources, searchMethod, hasRealResults",
      );
    }

    await this.client.mutation(api.messages.updateMessageMetadata, {
      messageId: IdUtils.toConvexMessageId(id),
      searchResults: updates.searchResults,
      sources: updates.sources,
      searchMethod: updates.searchMethod,
      hasRealResults: updates.hasRealResults,
      sessionId: this.sessionId,
    });
  }

  /**
   * Delete a message.
   * @param id - Message ID to delete
   * @throws Error if deletion fails - caller must handle failure
   */
  async deleteMessage(id: string): Promise<void> {
    try {
      await this.client.mutation(api.messages.deleteMessage, {
        messageId: IdUtils.toConvexMessageId(id),
      });
    } catch (error) {
      logger.error("Failed to delete message from Convex:", {
        error: getErrorMessage(error),
        id,
      });
      throw error;
    }
  }

  /**
   * Stream AI response for a chat message.
   * @param chatId - Chat ID to generate response for
   * @param message - User message to respond to
   * @yields MessageStreamChunk events (progress, reasoning, content, metadata, error, done)
   * @see {@link ../utils/sseParser.ts} - Shared SSE parsing logic
   */
  async *generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<MessageStreamChunk> {
    try {
      // Stream via HTTP SSE for live UI updates (server now persists)
      const host = window.location.hostname;
      const isDev = host === "localhost" || host === "127.0.0.1";
      const apiUrl = isDev
        ? "/api/ai/agent/stream"
        : `${env.convexUrl.replace(".convex.cloud", ".convex.site")}/api/ai/agent/stream`;

      // Build recent conversation context
      const recent = await this.getMessages(chatId);
      const chatHistory = recent
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }));

      const response = await fetch(apiUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message,
          chatId: IdUtils.toConvexChatId(chatId),
          sessionId: this.sessionId,
          conversationContext: chatHistory
            .map(
              (m) =>
                `${m.role === "user" ? "User" : m.role === "assistant" ? "Assistant" : "System"}: ${m.content}`,
            )
            .join("\n")
            .slice(0, 4000),
        }),
      });

      if (!response.ok) {
        const errorText = await readResponseBody(response);
        throw buildHttpError(
          response,
          errorText,
          "ConvexChatRepository.generateResponse",
        );
      }

      // Use shared SSE parser for stream processing
      for await (const evt of parseSSEStream(response)) {
        if (isSSEParseError(evt)) {
          logger.error("Failed to parse SSE frame", {
            error: evt.error,
            raw: evt.raw,
            chatId,
          });
          yield {
            type: "error",
            error: `Failed to parse SSE frame: ${evt.error}`,
          };
          continue;
        }

        const processed = await this.handleStreamEvent(evt);
        if (processed) {
          yield processed;
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error: getErrorMessage(error),
      };
    }
  }

  /**
   * Execute a web search query.
   * @param query - Search query text
   * @returns Search results
   * @throws Error if search fails - caller must handle failure
   */
  async searchWeb(query: string): Promise<SearchWebResponse> {
    try {
      return await this.client.action(api.search.searchWeb, {
        query,
        maxResults: 5,
      });
    } catch (error) {
      logger.error("Search failed:", { error: getErrorMessage(error), query });
      throw error;
    }
  }

  /**
   * Share a chat by updating its privacy setting.
   * @param id - Chat ID to share
   * @param privacy - Privacy level (shared or public)
   * @returns Object with shareId and/or publicId
   * @throws Error if sharing fails - caller must handle failure
   */
  async shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }> {
    try {
      await this.updateChatPrivacy(id, privacy);
      const chat = await this.getChatById(id);

      return {
        shareId: chat?.shareId,
        publicId: chat?.publicId,
      };
    } catch (error) {
      logger.error("Failed to share chat:", {
        error: getErrorMessage(error),
        id,
        privacy,
      });
      throw error;
    }
  }

  /**
   * Get a chat by its share ID.
   * @param shareId - Share ID to look up
   * @returns Doc<"chats"> if found, null if not found
   * @throws Error if fetch fails - caller must handle failure
   */
  async getChatByShareId(shareId: string): Promise<Doc<"chats"> | null> {
    const chat = await this.client.query(api.chats.getChatByShareId, {
      shareId,
    });
    return chat || null;
  }

  /**
   * Get a chat by its public ID.
   * @param publicId - Public ID to look up
   * @returns Doc<"chats"> if found, null if not found
   * @throws Error if fetch fails - caller must handle failure
   */
  async getChatByPublicId(publicId: string): Promise<Doc<"chats"> | null> {
    const chat = await this.client.query(api.chats.getChatByPublicId, {
      publicId,
    });
    return chat || null;
  }

  /**
   * Get chat by ID with retry logic for post-creation lookups.
   * Uses direct database lookup to bypass index propagation delays.
   * @param chatId - Convex chat ID
   * @param maxAttempts - Maximum retry attempts (default: MAX_LOOKUP_RETRIES)
   * @returns Doc<"chats"> or null
   * @see {@link ../constants/retry.ts} - Retry constants and backoff computation
   */
  private async getChatByIdWithRetry(
    chatId: Id<"chats">,
    maxAttempts = MAX_LOOKUP_RETRIES,
  ): Promise<Doc<"chats"> | null> {
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        // Use direct lookup query that bypasses indexes
        const chat = await this.client.query(api.chats.getChatByIdDirect, {
          chatId,
          sessionId: this.sessionId,
        });

        if (chat) {
          logger.debug("Chat retrieved successfully", {
            chatId,
            attempt,
            sessionId: this.sessionId,
          });
          return chat;
        }

        // Chat not found - wait before retrying with exponential backoff
        if (attempt < maxAttempts - 1) {
          const delay = computeFastBackoff(attempt);
          logger.debug("Chat not found, retrying", {
            chatId,
            attempt,
            delay,
            sessionId: this.sessionId,
          });
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      } catch (error) {
        logger.error("Error fetching chat", {
          chatId,
          attempt,
          error: getErrorMessage(error),
          sessionId: this.sessionId,
        });

        // Don't retry on errors, only on null results
        throw error;
      }
    }

    logger.error("Failed to retrieve chat after retries", {
      chatId,
      maxAttempts,
      sessionId: this.sessionId,
    });
    return null;
  }

  /**
   * Handle individual SSE events and transform them to MessageStreamChunks.
   * Encapsulates event processing logic to simplify the main generator loop.
   */
  private async handleStreamEvent(
    evt: SSEEvent,
  ): Promise<MessageStreamChunk | null> {
    if (evt.type === "progress") {
      return this.parseStreamEvent(ProgressEventSchema, evt);
    }

    if (evt.type === "reasoning") {
      return this.parseStreamEvent(ReasoningEventSchema, evt);
    }

    if (evt.type === "content") {
      return this.parseStreamEvent(ContentEventSchema, evt);
    }

    if (evt.type === "metadata") {
      return this.parseStreamEvent(MetadataEventSchema, evt);
    }

    if (evt.type === "tool_result") {
      return this.parseStreamEvent(ToolResultEventSchema, evt);
    }

    if (evt.type === "error") {
      return this.parseStreamEvent(ErrorEventSchema, evt);
    }

    if (evt.type === "complete") {
      return { type: "done" };
    }

    if (evt.type === "persisted") {
      return this.handlePersistedEvent(evt);
    }

    return null;
  }

  /**
   * Verify and process 'persisted' events.
   */
  private async handlePersistedEvent(
    evt: SSEEvent,
  ): Promise<MessageStreamChunk | null> {
    const parsed = PersistedEventSchema.safeParse(evt);
    if (!parsed.success) {
      logger.error("Invalid persisted SSE event payload", {
        error: parsed.error,
        sessionId: this.sessionId,
      });
      return null;
    }

    const signingKey = env.agentSigningKey;

    if (
      signingKey &&
      isSignatureVerificationAvailable() &&
      parsed.data.payload &&
      parsed.data.nonce &&
      parsed.data.signature
    ) {
      const isValid = await verifyPersistedPayload(
        parsed.data.payload,
        parsed.data.nonce,
        parsed.data.signature,
        signingKey,
      );

      if (!isValid) {
        logger.error("🚫 Invalid signature detected on persisted event", {
          workflowId: parsed.data.payload.workflowId,
          nonce: parsed.data.nonce,
        });
        return null;
      }

      logger.debug("✅ Signature verified for persisted event", {
        workflowId: parsed.data.payload.workflowId,
      });
    }

    let payloadWithTypedId: StreamingPersistPayload;
    try {
      payloadWithTypedId = {
        ...parsed.data.payload,
        assistantMessageId: IdUtils.toConvexMessageId(
          parsed.data.payload.assistantMessageId,
        ),
      };
    } catch (error) {
      logger.error("Invalid assistantMessageId in persisted payload", {
        error: getErrorMessage(error),
        assistantMessageId: parsed.data.payload.assistantMessageId,
      });
      return null;
    }

    return {
      ...parsed.data,
      payload: payloadWithTypedId,
    };
  }

  private parseStreamEvent<T extends MessageStreamChunk>(
    schema: z.ZodSchema<T>,
    evt: SSEEvent,
  ): T | null {
    const parsed = schema.safeParse(evt);
    if (!parsed.success) {
      logger.error("Invalid SSE event payload", {
        type: evt.type,
        error: parsed.error,
        sessionId: this.sessionId,
      });
      return null;
    }
    return parsed.data;
  }
}
