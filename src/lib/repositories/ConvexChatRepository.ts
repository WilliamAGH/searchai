/**
 * Convex Chat Repository Implementation
 * Handles chat operations for authenticated users using Convex backend
 */

import type { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { BaseRepository } from "./ChatRepository";
import type {
  UnifiedChat,
  UnifiedMessage,
  StreamChunk,
  ChatResponse,
} from "../types/unified";
import { IdUtils, TitleUtils } from "../types/unified";
import { logger } from "../logger";
// Removed unused imports from errorHandling

export class ConvexChatRepository extends BaseRepository {
  protected storageType = "convex" as const;
  private client: ConvexClient;
  private _sessionId?: string;
  private _allSessionIds?: string[];

  constructor(
    client: ConvexClient,
    sessionId?: string,
    allSessionIds?: string[],
  ) {
    super();
    this.client = client;
    this._sessionId = sessionId;
    this._allSessionIds = allSessionIds;

    // Log initialization for debugging
    logger.debug("ConvexChatRepository initialized", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  // Allow updating sessionId after creation
  setSessionId(sessionId: string | undefined) {
    this._sessionId = sessionId;
    logger.debug("ConvexChatRepository sessionId updated", {
      hasSessionId: !!sessionId,
      sessionId,
    });
  }

  // Allow updating all session IDs
  setAllSessionIds(sessionIds: string[] | undefined) {
    this._allSessionIds = sessionIds;
    logger.debug("ConvexChatRepository allSessionIds updated", {
      count: sessionIds?.length || 0,
    });
  }

  // Getter for sessionId
  get sessionId(): string | undefined {
    return this._sessionId;
  }

  // FIX: Ensure sessionId is properly accessible for all queries
  private get effectiveSessionId(): string | undefined {
    return this._sessionId;
  }

  // Chat operations
  async getChats(): Promise<UnifiedChat[]> {
    try {
      logger.debug(
        "[CONVEX_REPO] Getting chats with sessionId:",
        this.effectiveSessionId,
        "allSessionIds:",
        this._allSessionIds,
      );
      const chats = await this.client.query(api.chats.getUserChats, {
        sessionId: this.effectiveSessionId,
        sessionIds: this._allSessionIds || [], // Pass empty array instead of undefined
      });
      logger.debug("[CONVEX_REPO] Retrieved", chats?.length, "chats");
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
        lastSyncAt: Date.now(),
      }));
    } catch (error) {
      logger.error("Failed to fetch chats from Convex:", error);
      return [];
    }
  }

  async getChatById(id: string): Promise<UnifiedChat | null> {
    logger.debug(
      "[CONVEX_REPO] Getting chat by ID:",
      id,
      "with sessionId:",
      this.effectiveSessionId,
    );
    try {
      if (!IdUtils.isConvexId(id)) {
        // Try to find by opaque ID or share ID
        const byOpaque = await this.client.query(api.chats.getChatByOpaqueId, {
          opaqueId: id,
          sessionId: this.effectiveSessionId,
        });
        if (byOpaque) {
          return this.convexToUnifiedChat(byOpaque);
        }
        return null;
      }

      const chat = await this.client.query(api.chats.getChatById, {
        chatId: IdUtils.toConvexChatId(id),
        sessionId: this.effectiveSessionId,
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
        sessionId: this.effectiveSessionId,
        hasSessionId: !!this.effectiveSessionId,
      });

      const chatId = await this.client.mutation(api.chats.createChat, {
        title: TitleUtils.sanitize(finalTitle),
        sessionId: this.effectiveSessionId,
      });

      logger.debug("Chat created with ID", {
        chatId,
        sessionId: this.effectiveSessionId,
      });

      const chat = await this.getChatById(IdUtils.toUnifiedId(chatId));
      if (!chat) throw new Error("Failed to create chat");

      return { chat, isNew: true };
    } catch (error) {
      logger.error("Failed to create chat in Convex:", {
        error,
        sessionId: this.effectiveSessionId,
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
      });
    } catch (error) {
      // Only log as error if it's not a "chat not found" issue
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      if (errorMessage.includes("Chat not found")) {
        logger.debug("Chat already deleted from backend:", id);
      } else {
        logger.error("Failed to delete chat from Convex:", error);
      }
      throw error;
    }
  }

  // Message operations
  async getMessages(chatId: string): Promise<UnifiedMessage[]> {
    try {
      logger.debug("Fetching messages for chat", {
        chatId,
        sessionId: this.effectiveSessionId,
        hasSessionId: !!this.effectiveSessionId,
      });

      const messages = await this.client.query(api.chats.getChatMessages, {
        chatId: IdUtils.toConvexChatId(chatId),
        sessionId: this.effectiveSessionId,
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
        sessionId: this.effectiveSessionId,
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
      // Start the generation
      await this.client.action(api.ai.generateStreamingResponse, {
        chatId: IdUtils.toConvexChatId(chatId),
        message,
      });

      // Use Convex real-time subscriptions instead of polling
      // Note: This is a simplified implementation that still uses polling
      // because AsyncGenerators can't directly use Convex subscriptions.
      // For true real-time updates, the UI should subscribe directly.

      let lastContent = "";
      let iterations = 0;
      const maxIterations = 300; // 30 seconds timeout
      const convexChatId = IdUtils.toConvexChatId(chatId);

      while (iterations < maxIterations) {
        // Query the subscription endpoint for real-time data
        const updates = await this.client.query(
          api.chats.subscribeToChatUpdates,
          {
            chatId: convexChatId,
            sessionId: this.effectiveSessionId,
          },
        );

        if (!updates) {
          yield { type: "error", error: "Failed to get chat updates" };
          return;
        }

        // Check for streaming content in messages
        const streamingMessage = updates.messages?.find(
          (m) => m.role === "assistant" && m.isStreaming,
        );

        if (streamingMessage) {
          // Yield new content as it arrives
          if (
            streamingMessage.content &&
            streamingMessage.content !== lastContent
          ) {
            const newContent = streamingMessage.content.substring(
              lastContent.length,
            );
            if (newContent) {
              yield { type: "content", content: newContent };
              lastContent = streamingMessage.content;
            }
          }
        } else {
          // Check if there's a completed assistant message
          const completedMessage = updates.messages
            ?.filter((m) => m.role === "assistant")
            .pop();

          if (completedMessage && completedMessage.content) {
            // Yield any remaining content
            if (completedMessage.content.length > lastContent.length) {
              const finalContent = completedMessage.content.substring(
                lastContent.length,
              );
              if (finalContent.length > 0) {
                yield { type: "content", content: finalContent };
              }
            }
            yield { type: "done" };
            return;
          }
        }

        // Wait before next check
        await new Promise((resolve) => setTimeout(resolve, 100));
        iterations++;
      }

      yield { type: "error", error: "Response timeout" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  // NEW: Real-time streaming method using Convex subscriptions
  async *generateResponseStreaming(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk> {
    try {
      // Start the generation
      await this.client.action(api.ai.generateStreamingResponse, {
        chatId: IdUtils.toConvexChatId(chatId),
        message,
      });

      // Use real-time subscription instead of polling
      const convexChatId = IdUtils.toConvexChatId(chatId);
      let lastContent = "";
      let lastThinking: string | undefined;
      let iterations = 0;
      const maxIterations = 300; // 30 seconds timeout

      while (iterations < maxIterations) {
        // Query the subscription endpoint for real-time data
        const updates = await this.client.query(
          api.chats.subscribeToChatUpdates,
          {
            chatId: convexChatId,
            sessionId: this.effectiveSessionId,
          },
        );

        if (!updates) {
          yield { type: "error", error: "Failed to get chat updates" };
          return;
        }

        // Check for streaming content in messages
        const streamingMessage = updates.messages?.find(
          (m) => m.role === "assistant" && m.isStreaming,
        );

        if (streamingMessage) {
          // Yield new content as it arrives
          if (
            streamingMessage.content &&
            streamingMessage.content.length > lastContent.length
          ) {
            const newContent = streamingMessage.content.substring(
              lastContent.length,
            );
            if (newContent.length > 0) {
              yield { type: "content", content: newContent };
              lastContent = streamingMessage.content;
            }
          }

          // Yield thinking updates if available (only when it changes)
          if (
            typeof streamingMessage.thinking === "string" &&
            streamingMessage.thinking.length > 0 &&
            streamingMessage.thinking !== lastThinking
          ) {
            yield {
              type: "metadata",
              metadata: { thinking: streamingMessage.thinking },
            };
            lastThinking = streamingMessage.thinking;
          }
        } else {
          // Check if there's a completed assistant message
          const completedMessage = updates.messages
            ?.filter((m) => m.role === "assistant")
            .pop();

          if (completedMessage && completedMessage.content) {
            // Yield any remaining content
            if (completedMessage.content.length > lastContent.length) {
              const finalContent = completedMessage.content.substring(
                lastContent.length,
              );
              if (finalContent.length > 0) {
                yield { type: "content", content: finalContent };
              }
            }
            yield { type: "done" };
            return;
          }
        }

        // Reduced wait time for better responsiveness
        await new Promise((resolve) => setTimeout(resolve, 25)); // Was 100ms
        iterations++;
      }

      yield { type: "error", error: "Response timeout" };
    } catch (error) {
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
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
      return null;
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
      return null;
    }
  }

  // Migration and sync
  async exportData(): Promise<{
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }> {
    const chats = await this.getChats();
    const allMessages: UnifiedMessage[] = [];

    for (const chat of chats) {
      const messages = await this.getMessages(chat.id);
      allMessages.push(...messages);
    }

    return { chats, messages: allMessages };
  }

  async importData(data: {
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }): Promise<void> {
    // Import is handled through the migration service
    // This creates new chats and messages in Convex
    for (const chat of data.chats) {
      try {
        await this.createChat(chat.title);

        // Import messages for this chat
        const chatMessages = data.messages.filter((m) => m.chatId === chat.id);
        // This would need a special import mutation in Convex
        // For now, we skip message import
        logger.info(
          `Would import ${chatMessages.length} messages for chat ${chat.id}`,
        );
      } catch (error) {
        logger.error(`Failed to import chat ${chat.id}:`, error);
      }
    }
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
      lastSyncAt: Date.now(),
    };
  }

  private convexToUnifiedMessage(msg: unknown): UnifiedMessage {
    const m = msg as Record<string, unknown>;
    const messageId = IdUtils.toUnifiedId(m._id as Id<"messages">);
    return {
      _id: messageId, // CRITICAL: Include _id for React keys and delete functionality
      id: messageId,
      chatId: IdUtils.toUnifiedId(m.chatId as Id<"chats">),
      role: m.role as "user" | "assistant" | "system",
      content: (m.content || "") as string,
      timestamp: (m.timestamp || m._creationTime) as number,
      searchResults: m.searchResults as UnifiedMessage["searchResults"],
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
    };
  }
}
