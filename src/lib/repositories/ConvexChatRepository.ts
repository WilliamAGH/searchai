/**
 * Convex Chat Repository Implementation
 * Handles chat operations for authenticated users using Convex backend
 */

import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BaseRepository } from "./ChatRepository";
import {
  UnifiedChat,
  UnifiedMessage,
  StreamChunk,
  ChatResponse,
  IdUtils,
  TitleUtils,
} from "../types/unified";
import { logger } from "../logger";
import { buildHttpError, readResponseBody } from "../utils/httpUtils";
import { getErrorMessage } from "../utils/errorUtils";
import {
  verifyPersistedPayload,
  isSignatureVerificationAvailable,
  type PersistedPayload,
} from "../security/signature";
import { env } from "../env";
// Removed unused imports from errorHandling

export class ConvexChatRepository extends BaseRepository {
  protected storageType = "convex" as const;
  private client: ConvexClient;
  private sessionId?: string;

  constructor(client: ConvexClient, sessionId?: string) {
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

  // Chat operations
  async getChats(): Promise<UnifiedChat[]> {
    try {
      const chats = await this.client.query(api.chats.getUserChats, {
        sessionId: this.sessionId,
      });
      if (!chats) return [];

      return chats.map((chat) => ({
        id: IdUtils.toUnifiedId(chat._id),
        title: chat.title,
        createdAt: chat._creationTime,
        updatedAt: chat.updatedAt || chat._creationTime,
        privacy: chat.privacy || "private",
        shareId: chat.shareId,
        publicId: chat.publicId,
        rollingSummary: chat.rollingSummary,
        source: "convex",
        synced: true,
        isLocal: false,
        lastSyncAt: Date.now(),
      }));
    } catch (error) {
      logger.error("Failed to fetch chats from Convex:", error);
      return [];
    }
  }

  async getChatById(id: string): Promise<UnifiedChat | null> {
    try {
      if (!IdUtils.isConvexId(id)) {
        // Try to find by opaque ID or share ID
        const byOpaque = await this.client.query(api.chats.getChatByOpaqueId, {
          opaqueId: id,
          sessionId: this.sessionId,
        });
        if (byOpaque) {
          return this.convexToUnifiedChat(byOpaque);
        }
        return null;
      }

      const chat = await this.client.query(api.chats.getChatById, {
        chatId: IdUtils.toConvexChatId(id),
        sessionId: this.sessionId,
      });

      return chat ? this.convexToUnifiedChat(chat) : null;
    } catch (error) {
      logger.error("Failed to fetch chat from Convex:", error);
      return null;
    }
  }

  async createChat(title?: string): Promise<ChatResponse> {
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
        error,
        sessionId: this.sessionId,
      });
      throw error;
    }
  }

  /**
   * Update the title of an existing chat
   * @param id - Chat ID to update
   * @param title - New title for the chat
   * @throws {Error} If update fails
   */
  async updateChatTitle(id: string, title: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.updateChatTitle, {
        chatId: IdUtils.toConvexChatId(id),
        title: TitleUtils.sanitize(title),
      });
    } catch (error) {
      logger.error("Failed to update chat title in Convex:", error);
      throw error;
    }
  }

  /**
   * Update the privacy setting of a chat
   * @param id - Chat ID to update
   * @param privacy - New privacy setting (private, shared, or public)
   * @throws {Error} If update fails
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
      logger.error("Failed to update chat privacy in Convex:", error);
      throw error;
    }
  }

  /**
   * Delete a chat and all its messages
   * @param id - Chat ID to delete
   * @throws {Error} If deletion fails
   */
  async deleteChat(id: string): Promise<void> {
    try {
      await this.client.mutation(api.chats.deleteChat, {
        chatId: IdUtils.toConvexChatId(id),
        sessionId: this.sessionId,
      });
    } catch (error) {
      logger.error("Failed to delete chat from Convex:", error);
      throw error;
    }
  }

  // Message operations
  async getMessages(chatId: string): Promise<UnifiedMessage[]> {
    try {
      logger.debug("Fetching messages for chat", {
        chatId,
        sessionId: this.sessionId,
        hasSessionId: !!this.sessionId,
      });

      const messages = await this.client.query(api.chats.getChatMessages, {
        chatId: IdUtils.toConvexChatId(chatId),
        sessionId: this.sessionId,
      });

      if (!messages) {
        logger.warn("No messages returned from Convex", { chatId });
        return [];
      }

      logger.debug("Messages fetched successfully", {
        chatId,
        count: messages.length,
      });

      return messages.map((msg) => this.convexToUnifiedMessage(msg));
    } catch (error) {
      logger.error("Failed to fetch messages from Convex:", {
        error,
        chatId,
        sessionId: this.sessionId,
      });
      return [];
    }
  }

  /**
   * Get paginated messages for a chat
   * Used for performance optimization in chats with many messages
   * @param chatId - ID of the chat to get messages for
   * @param limit - Maximum number of messages to return (default: 50)
   * @param cursor - Pagination cursor for fetching next batch
   * @returns Object containing messages array, next cursor, and hasMore flag
   */
  async getMessagesPaginated(
    chatId: string,
    limit = 50,
    cursor?: string,
  ): Promise<{
    messages: UnifiedMessage[];
    nextCursor?: string;
    hasMore: boolean;
  }> {
    try {
      const result = await this.client.query(
        api.chats.messagesPaginated.getChatMessagesPaginated,
        {
          chatId: IdUtils.toConvexChatId(chatId),
          limit,
          cursor,
        },
      );

      if (!result) {
        return {
          messages: [],
          hasMore: false,
        };
      }

      const messages = result.messages.map((msg) =>
        this.convexToUnifiedMessage(msg),
      );

      return {
        messages,
        nextCursor: result.nextCursor,
        hasMore: result.hasMore,
      };
    } catch (error) {
      logger.error("Failed to fetch paginated messages from Convex:", error);
      return {
        messages: [],
        hasMore: false,
      };
    }
  }

  async addMessage(
    chatId: string,
    message: Partial<UnifiedMessage>,
  ): Promise<UnifiedMessage> {
    try {
      // Note: addMessage is an internal mutation in Convex, primarily used by the streaming response
      // For user messages, they are typically added as part of the generateResponse flow
      // This implementation provides a way to add messages directly if needed

      // Convex typing: addMessage is an internal mutation; cast narrowly at callsite
      const messageId = await this.client.mutation(
        api.messages.addMessage as unknown as (args: {
          chatId: ReturnType<typeof IdUtils.toConvexChatId>;
          role: "user" | "assistant" | "system";
          content: string;
          searchResults?: UnifiedMessage["searchResults"];
          sources?: string[];
          reasoning?: string;
          searchMethod?: UnifiedMessage["searchMethod"];
          hasRealResults?: boolean;
          isStreaming?: boolean;
          streamedContent?: string;
          thinking?: string;
        }) => Promise<unknown>,
        {
          chatId: IdUtils.toConvexChatId(chatId),
          role: message.role || "user",
          content: message.content || "",
          searchResults: message.searchResults,
          sources: message.sources,
          reasoning: message.reasoning,
          searchMethod: message.searchMethod,
          hasRealResults: message.hasRealResults,
          isStreaming: message.isStreaming,
          streamedContent: message.streamedContent,
          thinking: message.thinking,
        },
      );

      // Fetch the created message
      const messages = await this.getMessages(chatId);
      const createdMessage = messages.find(
        (m) => m.id === IdUtils.toUnifiedId(messageId),
      );

      if (!createdMessage) {
        throw new Error("Failed to retrieve created message");
      }

      return createdMessage;
    } catch (error) {
      logger.error("Failed to add message to Convex:", error);
      // Fallback: For user messages in authenticated mode, use the generateResponse flow
      throw new Error(
        "Direct message addition not supported. Use generateResponse for adding messages in Convex authenticated mode.",
      );
    }
  }

  async updateMessage(
    id: string,
    updates: Partial<UnifiedMessage>,
  ): Promise<void> {
    try {
      // Update message metadata using the available mutation
      if (
        updates.searchResults ||
        updates.sources ||
        updates.searchMethod ||
        updates.hasRealResults !== undefined
      ) {
        await this.client.mutation(api.messages.updateMessageMetadata, {
          messageId: IdUtils.toConvexMessageId(id),
          searchResults: updates.searchResults,
          sources: updates.sources,
          searchMethod: updates.searchMethod,
          hasRealResults: updates.hasRealResults,
          sessionId: this.sessionId,
        });
      }

      // Note: Content and reasoning updates are handled by internal mutations
      // during the streaming process. Direct content updates are not exposed
      // as public mutations for security reasons.
      if (updates.content || updates.reasoning) {
        logger.warn(
          "Direct content/reasoning updates not supported in Convex. These are updated during streaming.",
        );
      }
    } catch (error) {
      logger.error("Failed to update message in Convex:", error);
      throw error;
    }
  }

  async deleteMessage(id: string): Promise<void> {
    try {
      await this.client.mutation(api.messages.deleteMessage, {
        messageId: IdUtils.toConvexMessageId(id),
      });
    } catch (error) {
      logger.error("Failed to delete message from Convex:", error);
      throw error;
    }
  }

  // Search and AI operations
  async *generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk> {
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

      if (!response.body) {
        throw new Error(
          `Streaming response missing body from ${apiUrl} (HTTP ${response.status} ${response.statusText})`,
        );
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";

      // Stream all events to the generator
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split(/\r?\n/);
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (!line.startsWith("data: ")) continue;
          const data = line.slice(6);
          if (!data) continue;
          try {
            const evt = JSON.parse(data);
            switch (evt.type) {
              case "progress":
              case "reasoning":
              case "content":
              case "metadata":
              case "tool_result":
              case "error":
                yield evt as StreamChunk;
                break;
              case "persisted": {
                // Verify signature if available and enabled
                // Note: Signature verification is optional in production since
                // the signing key can't be safely embedded in frontend code.
                // In dev, you can set VITE_AGENT_SIGNING_KEY for testing.
                const signingKey = import.meta.env.VITE_AGENT_SIGNING_KEY;

                if (
                  signingKey &&
                  isSignatureVerificationAvailable() &&
                  evt.payload &&
                  evt.nonce &&
                  evt.signature
                ) {
                  const isValid = await verifyPersistedPayload(
                    evt.payload as PersistedPayload,
                    evt.nonce,
                    evt.signature,
                    signingKey,
                  );

                  if (!isValid) {
                    logger.error(
                      "🚫 Invalid signature detected on persisted event",
                      {
                        workflowId: evt.payload?.workflowId,
                        nonce: evt.nonce,
                      },
                    );
                    // Skip this event - possible tampering
                    break;
                  }

                  logger.debug("✅ Signature verified for persisted event", {
                    workflowId: evt.payload?.workflowId,
                  });
                }

                yield evt as StreamChunk;
                break;
              }
              case "complete":
                yield { type: "done" };
                break;
            }
          } catch (error) {
            const message = getErrorMessage(error);
            logger.error("Failed to parse SSE frame", {
              error: message,
              raw: data,
              chatId,
            });
            yield {
              type: "error",
              error: `Failed to parse SSE frame: ${message}. Raw: ${data}`,
            };
          }
        }
      }
    } catch (error) {
      yield {
        type: "error",
        error: getErrorMessage(error),
      };
    }
  }

  async searchWeb(query: string): Promise<unknown> {
    try {
      return await this.client.action(api.search.searchWeb, {
        query,
        maxResults: 5,
      });
    } catch (error) {
      logger.error("Search failed:", error);
      throw error;
    }
  }

  // Sharing operations
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
      logger.error("Failed to share chat:", error);
      throw error;
    }
  }

  async getChatByShareId(shareId: string): Promise<UnifiedChat | null> {
    try {
      const chat = await this.client.query(api.chats.getChatByShareId, {
        shareId,
      });
      return chat ? this.convexToUnifiedChat(chat) : null;
    } catch (error) {
      logger.error("Failed to fetch chat by share ID:", error);
      throw error;
    }
  }

  async getChatByPublicId(publicId: string): Promise<UnifiedChat | null> {
    try {
      const chat = await this.client.query(api.chats.getChatByPublicId, {
        publicId,
      });
      return chat ? this.convexToUnifiedChat(chat) : null;
    } catch (error) {
      logger.error("Failed to fetch chat by public ID:", error);
      throw error;
    }
  }

  /**
   * Get chat by ID with retry logic for post-creation lookups
   * Uses direct database lookup to bypass index propagation delays
   * @param chatId - Convex chat ID
   * @param maxAttempts - Maximum number of retry attempts (default: 5)
   * @returns UnifiedChat or null
   */
  private async getChatByIdWithRetry(
    chatId: Id<"chats">,
    maxAttempts = 5,
  ): Promise<UnifiedChat | null> {
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
          return this.convexToUnifiedChat(chat);
        }

        // Chat not found - wait before retrying
        if (attempt < maxAttempts - 1) {
          const delay = 50 * Math.pow(2, attempt); // Exponential backoff: 50ms, 100ms, 200ms, 400ms
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
          error,
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

  // Helper methods
  private convexToUnifiedChat(chat: unknown): UnifiedChat {
    const c = chat as Record<string, unknown>;
    return {
      id: IdUtils.toUnifiedId(c._id as Id<"chats">),
      title: c.title as string,
      createdAt: c._creationTime as number,
      updatedAt: (c.updatedAt || c._creationTime) as number,
      privacy: (c.privacy || "private") as "private" | "shared" | "public",
      shareId: c.shareId as string | undefined,
      publicId: c.publicId as string | undefined,
      rollingSummary: c.rollingSummary as string | undefined,
      source: "convex",
      synced: true,
      isLocal: false,
      lastSyncAt: Date.now(),
    };
  }

  private convexToUnifiedMessage(msg: unknown): UnifiedMessage {
    const m = msg as Record<string, unknown>;
    const contextReferences = Array.isArray(m.contextReferences)
      ? (m.contextReferences as UnifiedMessage["contextReferences"])
      : undefined;
    const searchResultsFromDoc =
      Array.isArray(m.searchResults) && m.searchResults.length > 0
        ? (m.searchResults as UnifiedMessage["searchResults"])
        : undefined;
    const derivedSearchResults =
      !searchResultsFromDoc && contextReferences
        ? contextReferences
            .filter(
              (ref) =>
                ref &&
                typeof ref.url === "string" &&
                (ref.title || ref.url) &&
                typeof ref.timestamp === "number",
            )
            .map((ref) => {
              const safeUrl = ref.url as string;
              const title = ref.title || safeUrl;
              return {
                title,
                url: safeUrl,
                snippet: "",
                relevanceScore: ref.relevanceScore ?? 0.5,
              };
            })
        : undefined;

    return {
      id: IdUtils.toUnifiedId(m._id as Id<"messages">),
      chatId: IdUtils.toUnifiedId(m.chatId as Id<"chats">),
      role: m.role as "user" | "assistant" | "system",
      content: (m.content || "") as string,
      timestamp: (m.timestamp || m._creationTime) as number,
      searchResults: searchResultsFromDoc ?? derivedSearchResults,
      sources: m.sources as string[] | undefined,
      reasoning: m.reasoning as string | undefined,
      searchMethod: m.searchMethod as UnifiedMessage["searchMethod"],
      hasRealResults: m.hasRealResults as boolean | undefined,
      isStreaming: m.isStreaming as boolean | undefined,
      streamedContent: m.streamedContent as string | undefined,
      thinking: m.thinking as string | undefined,
      source: "convex",
      synced: true,
      lastSyncAt: Date.now(),
      contextReferences,
      workflowId: m.workflowId as string | undefined,
    };
  }
}
