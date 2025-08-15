/**
 * LocalStorage Chat Repository Implementation
 * Handles chat operations for unauthenticated users using browser localStorage
 */

import { BaseRepository } from "./ChatRepository";
import {
  UnifiedChat,
  UnifiedMessage,
  StreamChunk,
  ChatResponse,
  IdUtils,
  TitleUtils,
  StorageUtils,
} from "../types/unified";
import {
  parseLocalChats,
  parseLocalMessages,
} from "../validation/localStorage";
import { UnauthenticatedAIService } from "../services/UnauthenticatedAIService";
import { logger } from "../logger";
import type { LocalMessage } from "../types/message";

// Use legacy keys directly for backward compatibility
const STORAGE_KEYS = {
  CHATS: "searchai_chats_v2",
  MESSAGES: "searchai_messages_v2",
  SETTINGS: "searchai_settings",
} as const;

export class LocalChatRepository extends BaseRepository {
  protected storageType = "local" as const;
  private aiService: UnauthenticatedAIService;
  private abortController: AbortController | null = null;

  constructor(convexUrl?: string) {
    super();
    if (!StorageUtils.hasLocalStorage()) {
      throw new Error("LocalStorage is not available in this browser");
    }

    // Initialize AI service with convex URL
    this.aiService = new UnauthenticatedAIService(
      convexUrl || import.meta.env.VITE_CONVEX_URL || "",
    );
  }

  // Chat operations
  async getChats(): Promise<UnifiedChat[]> {
    try {
      // Using raw localStorage for backward compatibility with legacy keys
      const stored = localStorage.getItem(STORAGE_KEYS.CHATS);
      if (!stored) return [];

      const chats = parseLocalChats(stored);
      return chats.map(
        (chat) =>
          ({
            ...chat,
            id: chat._id,
            source: "local" as const,
            synced: false,
          }) as UnifiedChat,
      );
    } catch (error) {
      logger.error("Failed to load chats from localStorage:", error);
      return [];
    }
  }

  async getChatById(id: string): Promise<UnifiedChat | null> {
    const chats = await this.getChats();
    return chats.find((c) => c.id === id) || null;
  }

  async createChat(title?: string): Promise<ChatResponse> {
    const finalTitle = title || "New Chat";
    const chat: UnifiedChat = {
      id: IdUtils.generateLocalId("chat"),
      title: TitleUtils.sanitize(finalTitle),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      privacy: "private",
      source: "local",
      synced: false,
    };

    const chats = await this.getChats();
    chats.unshift(chat); // Add to beginning
    await this.saveChats(chats);

    return { chat, isNew: true };
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const chats = await this.getChats();
    const index = chats.findIndex((c) => c.id === id);

    if (index === -1) {
      throw new Error(`Chat ${id} not found`);
    }

    chats[index].title = TitleUtils.sanitize(title);
    chats[index].updatedAt = Date.now();
    await this.saveChats(chats);
  }

  async updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<void> {
    const chats = await this.getChats();
    const index = chats.findIndex((c) => c.id === id);

    if (index === -1) {
      throw new Error(`Chat ${id} not found`);
    }

    chats[index].privacy = privacy;
    chats[index].updatedAt = Date.now();

    // For shared/public chats, we need to publish to server
    if (privacy !== "private") {
      // This will be handled by the publishAnonymousChat flow
      // Just update local state for now
    }

    await this.saveChats(chats);
  }

  async deleteChat(id: string): Promise<void> {
    const chats = await this.getChats();
    const filtered = chats.filter((c) => c.id !== id);
    await this.saveChats(filtered);

    // Also delete associated messages
    const messages = await this.getAllMessages();
    const filteredMessages = messages.filter((m) => m.chatId !== id);
    await this.saveMessages(filteredMessages);
  }

  // Message operations
  async getMessages(chatId: string): Promise<UnifiedMessage[]> {
    const messages = await this.getAllMessages();
    return messages
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => a.timestamp - b.timestamp);
  }

  async addMessage(
    chatId: string,
    message: Partial<UnifiedMessage>,
  ): Promise<UnifiedMessage> {
    const fullMessage: UnifiedMessage = {
      id: IdUtils.generateLocalId("msg"),
      chatId,
      role: message.role || "user",
      content: message.content || "",
      timestamp: Date.now(),
      source: "local",
      synced: false,
      ...message,
    };

    const messages = await this.getAllMessages();
    messages.push(fullMessage);
    await this.saveMessages(messages);

    // Update chat's updatedAt timestamp
    const chats = await this.getChats();
    const chatIndex = chats.findIndex((c) => c.id === chatId);
    if (chatIndex !== -1) {
      chats[chatIndex].updatedAt = Date.now();
      await this.saveChats(chats);
    }

    return fullMessage;
  }

  async updateMessage(
    id: string,
    updates: Partial<UnifiedMessage>,
  ): Promise<void> {
    const messages = await this.getAllMessages();
    const index = messages.findIndex((m) => m.id === id);

    if (index === -1) {
      throw new Error(`Message ${id} not found`);
    }

    messages[index] = { ...messages[index], ...updates };
    await this.saveMessages(messages);
  }

  async deleteMessage(id: string): Promise<void> {
    const messages = await this.getAllMessages();
    const filtered = messages.filter((m) => m.id !== id);
    await this.saveMessages(filtered);
  }

  // Search and AI operations
  async *generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk> {
    // Abort any existing request
    this.aiService.abort();

    try {
      // Persist the user's message immediately so UI reflects it and toolbar is available
      await this.addMessage(chatId, {
        role: "user",
        content: message,
      });
      // Get messages for context
      const localMessages = await this.getAllMessages();
      const context = {
        localMessages: localMessages.map(
          (msg) =>
            ({
              _id: msg.id,
              chatId: msg.chatId,
              role: msg.role,
              content: msg.content || "",
              timestamp: msg.timestamp,
              searchResults: msg.searchResults,
              sources: msg.sources,
              reasoning: msg.reasoning,
              searchMethod: msg.searchMethod,
              hasRealResults: msg.hasRealResults,
              isLocal: true,
              source: "local" as const,
            }) as LocalMessage,
        ),
      };

      let assistantMessageId: string | null = null;
      let fullContent = "";
      let metadata: Record<string, unknown> = {};

      // Generate response using AI service
      await this.aiService.generateResponse(message, chatId, context, {
        onProgress: (progress) => {
          // Yield progress updates as metadata
          if (progress.stage !== "idle") {
            // Note: Can't yield here directly due to async context
            // Progress will be handled via message updates
          }
        },
        onMessageCreate: async (_message) => {
          // Save initial assistant message placeholder and capture its ID
          const created = await this.addMessage(chatId, {
            role: "assistant",
            content: "",
            // Metadata fields will be updated as chunks arrive
            isStreaming: true,
          });
          assistantMessageId = created.id;

          // Yield initial metadata
          if (_message.searchResults || _message.sources) {
            metadata = {
              searchResults: _message.searchResults,
              sources: _message.sources,
              searchMethod: _message.searchMethod,
              hasRealResults: _message.hasRealResults,
            };
          }
        },
        onMessageUpdate: async (messageId, updates) => {
          if (updates.content !== undefined) {
            fullContent = updates.content;
          }
          if (updates.reasoning) {
            metadata.thinking = updates.reasoning;
          }

          // Update the message in storage
          if (assistantMessageId) {
            await this.updateMessage(assistantMessageId, {
              content: fullContent,
              reasoning: updates.reasoning,
              isStreaming: updates.isStreaming,
            });
          }
        },
      });

      // Yield the complete content and metadata
      if (fullContent) {
        yield { type: "content", content: fullContent };
      }
      if (Object.keys(metadata).length > 0) {
        yield { type: "metadata", metadata };
      }
      yield { type: "done" };
    } catch (error) {
      logger.error("LocalChatRepository.generateResponse error:", error);
      yield {
        type: "error",
        error: error instanceof Error ? error.message : "Unknown error",
      };
    }
  }

  async searchWeb(query: string): Promise<unknown> {
    const response = await fetch("/api/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ query }),
    });

    if (!response.ok) {
      throw new Error(`Search failed: ${response.statusText}`);
    }

    return response.json();
  }

  // Sharing operations
  async shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }> {
    const chat = await this.getChatById(id);
    if (!chat) throw new Error(`Chat ${id} not found`);

    const messages = await this.getMessages(id);

    // Try to publish to server; if unavailable, generate local fallback IDs
    let shareId: string | undefined;
    let publicId: string | undefined;

    const generateLocalId = (prefix: string): string =>
      `${prefix}_${Date.now().toString(36)}_${Math.random()
        .toString(36)
        .slice(2, 10)}`;

    try {
      const response = await fetch("/api/publishChat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: chat.title,
          privacy,
          messages: messages.map((m) => ({
            role: m.role,
            content: m.content,
            timestamp: m.timestamp,
            searchResults: m.searchResults,
            sources: m.sources,
          })),
        }),
      });

      if (response.ok) {
        const result = (await response.json()) as {
          shareId?: string;
          publicId?: string;
        };
        shareId = result.shareId;
        publicId = result.publicId;
      } else {
        // Fallback to local IDs on non-200
        if (privacy === "shared") shareId = generateLocalId("s");
        else publicId = generateLocalId("p");
      }
    } catch {
      // Network or proxy unavailable — fallback to local IDs
      if (privacy === "shared") shareId = generateLocalId("s");
      else publicId = generateLocalId("p");
    }

    // Update local chat with share/public IDs and privacy
    chat.shareId = shareId ?? chat.shareId;
    chat.publicId = publicId ?? chat.publicId;
    chat.privacy = privacy;

    const chats = await this.getChats();
    const index = chats.findIndex((c) => c.id === id);
    if (index !== -1) {
      chats[index] = chat;
      await this.saveChats(chats);
    }

    return { shareId, publicId };
  }

  async getChatByShareId(shareId: string): Promise<UnifiedChat | null> {
    const chats = await this.getChats();
    return chats.find((c) => c.shareId === shareId) || null;
  }

  async getChatByPublicId(publicId: string): Promise<UnifiedChat | null> {
    const chats = await this.getChats();
    return chats.find((c) => c.publicId === publicId) || null;
  }

  // Migration and sync
  async exportData(): Promise<{
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }> {
    const chats = await this.getChats();
    const messages = await this.getAllMessages();
    return { chats, messages };
  }

  async importData(data: {
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }): Promise<void> {
    // Merge with existing data
    const existingChats = await this.getChats();
    const existingMessages = await this.getAllMessages();

    const chatIds = new Set(existingChats.map((c) => c.id));
    const messageIds = new Set(existingMessages.map((m) => m.id));

    // Add new chats
    for (const chat of data.chats) {
      if (!chatIds.has(chat.id)) {
        existingChats.push(chat);
      }
    }

    // Add new messages
    for (const message of data.messages) {
      if (!messageIds.has(message.id)) {
        existingMessages.push(message);
      }
    }

    await this.saveChats(existingChats);
    await this.saveMessages(existingMessages);
  }

  // Private helper methods
  private async getAllMessages(): Promise<UnifiedMessage[]> {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.MESSAGES);
      if (!stored) return [];

      const messages = parseLocalMessages(stored);
      return messages.map(
        (msg) =>
          ({
            ...msg,
            id: msg._id,
            source: "local" as const,
            synced: false,
          }) as UnifiedMessage,
      );
    } catch (error) {
      logger.error("Failed to load messages from localStorage:", error);
      return [];
    }
  }

  private async saveChats(chats: UnifiedChat[]): Promise<void> {
    // Convert back to legacy format for compatibility
    const legacy = chats.map((chat) => ({
      _id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      privacy: chat.privacy,
      shareId: chat.shareId,
      publicId: chat.publicId,
      isLocal: true,
    }));

    localStorage.setItem(STORAGE_KEYS.CHATS, JSON.stringify(legacy));
  }

  private async saveMessages(messages: UnifiedMessage[]): Promise<void> {
    // Convert back to legacy format for compatibility
    const legacy = messages.map((msg) => ({
      _id: msg.id,
      chatId: msg.chatId,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp,
      searchResults: msg.searchResults,
      sources: msg.sources,
      reasoning: msg.reasoning,
      searchMethod: msg.searchMethod,
      hasRealResults: msg.hasRealResults,
    }));

    localStorage.setItem(STORAGE_KEYS.MESSAGES, JSON.stringify(legacy));
  }

  private async getRecentContext(
    chatId: string,
    limit: number = 10,
  ): Promise<unknown[]> {
    const messages = await this.getMessages(chatId);
    return messages
      .slice(-limit)
      .map((m) => ({ role: m.role, content: m.content }));
  }
}
