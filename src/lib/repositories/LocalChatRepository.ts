/**
 * Repository for managing local chat storage
 * Used for unauthenticated users with browser localStorage
 */

import { nanoid } from "nanoid";
import type { IChatRepository } from "./ChatRepository";
import type {
  UnifiedChat,
  UnifiedMessage,
  LocalChat,
  LocalMessage,
  ChatResponse,
} from "../types/unified";
import type { StreamChunk } from "../types/stream";
import {
  parseLocalChats,
  parseLocalMessages,
} from "../validation/localStorage";
import { UnauthenticatedAIService } from "../services/UnauthenticatedAIService";
import { logger } from "../logger";

const CHATS_KEY = "searchai_chats_v2";
const MESSAGES_KEY = "searchai_messages_v2";

export class LocalChatRepository implements IChatRepository {
  protected storageType = "local" as const;
  private aiService: UnauthenticatedAIService;
  private abortController: AbortController | null = null;

  constructor(convexUrl?: string) {
    if (!this.isStorageAvailable()) {
      throw new Error("LocalStorage is not available");
    }

    // Initialize AI service with convex URL
    this.aiService = new UnauthenticatedAIService(
      convexUrl || import.meta.env.VITE_CONVEX_URL || "",
    );
  }

  private isStorageAvailable(): boolean {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  }

  async initialize(): Promise<void> {
    // localStorage is synchronous, no async initialization needed
    logger.info("LocalChatRepository initialized");
  }

  // Chat operations
  async createChat(title?: string): Promise<ChatResponse> {
    const chatId = nanoid();
    const chat: LocalChat & { _id: string } = {
      _id: chatId,  // Store with _id for consistency with tests
      id: chatId,
      title: title || "New Chat",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      isLocal: true,
      source: "local",
      messages: [],
    };

    // Get raw local chats for storage
    const stored = localStorage.getItem(CHATS_KEY);
    const chats = stored ? parseLocalChats(stored) || [] : [];
    chats.unshift(chat);
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));

    // Convert to UnifiedChat for response
    const unifiedChat: UnifiedChat = {
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      privacy: "private",
      source: "local",
      synced: false,
      isLocal: true,
      messages: [],
    };

    return { chat: unifiedChat, isNew: true };
  }

  async getChats(): Promise<UnifiedChat[]> {
    const stored = localStorage.getItem(CHATS_KEY);
    if (!stored) return [];
    const parsed = parseLocalChats(stored);
    if (!parsed) return [];
    
    // Convert LocalChat[] to UnifiedChat[]
    return parsed.map(chat => ({
      id: chat.id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      privacy: "private" as const,
      source: "local" as const,
      synced: false,
      isLocal: true,
      messages: chat.messages || [],
    }));
  }

  async getChatById(id: string): Promise<UnifiedChat | null> {
    const chats = await this.getChats();
    return chats.find((c) => c.id === id) || null;
  }

  async deleteChat(id: string): Promise<void> {
    // Get raw local chats, not unified
    const stored = localStorage.getItem(CHATS_KEY);
    if (!stored) return;
    const parsed = parseLocalChats(stored);
    if (!parsed) return;
    
    const filtered = parsed.filter((c) => c.id !== id);
    localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));

    // Also delete messages for this chat
    localStorage.removeItem(`${MESSAGES_PREFIX}${id}`);
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const chats = await this.getChats();
    const chat = chats.find((c) => c.id === id);
    if (!chat) throw new Error(`Chat ${id} not found`);

    chat.title = title;
    chat.updatedAt = Date.now();
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }

  // Message operations
  async getMessages(chatId: string): Promise<LocalMessage[]> {
    const stored = localStorage.getItem(`${MESSAGES_PREFIX}${chatId}`);
    if (!stored) return [];
    const parsed = parseLocalMessages(stored);
    return parsed || [];
  }

  private async getAllMessages(): Promise<LocalMessage[]> {
    const chats = await this.getChats();
    const allMessages: LocalMessage[] = [];

    for (const chat of chats) {
      const messages = await this.getMessages(chat.id);
      allMessages.push(...messages);
    }

    return allMessages;
  }

  async addMessage(
    chatId: string,
    message: Partial<LocalMessage>,
  ): Promise<LocalMessage> {
    const messages = await this.getMessages(chatId);
    const newMessage: LocalMessage = {
      id: nanoid(),
      chatId,
      role: message.role || "user",
      content: message.content || "",
      timestamp: Date.now(),
      isLocal: true,
      source: "local",
      ...message,
    };

    messages.push(newMessage);
    localStorage.setItem(
      `${MESSAGES_PREFIX}${chatId}`,
      JSON.stringify(messages),
    );

    // Update chat's updatedAt
    const chats = await this.getChats();
    const chat = chats.find((c) => c.id === chatId);
    if (chat) {
      chat.updatedAt = Date.now();
      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }

    return newMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    const chats = await this.getChats();
    for (const chat of chats) {
      const messages = await this.getMessages(chat.id);
      const filtered = messages.filter((m) => m.id !== id);
      if (filtered.length !== messages.length) {
        localStorage.setItem(
          `${MESSAGES_PREFIX}${chat.id}`,
          JSON.stringify(filtered),
        );
        break;
      }
    }
  }

  async updateMessage(
    id: string,
    updates: Partial<LocalMessage>,
  ): Promise<void> {
    const chats = await this.getChats();
    for (const chat of chats) {
      const messages = await this.getMessages(chat.id);
      const message = messages.find((m) => m.id === id);
      if (message) {
        Object.assign(message, updates);
        localStorage.setItem(
          `${MESSAGES_PREFIX}${chat.id}`,
          JSON.stringify(messages),
        );
        break;
      }
    }
  }

  // AI generation
  async *generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk> {
    // Abort any existing request
    this.aiService.abort();

    try {
      // NOTE: User message is already added by useChatActions before calling generateResponse
      // Don't add it again here to avoid duplicates
      // Get messages for context
      const localMessages = await this.getAllMessages();
      const chatHistory = localMessages
        .filter((m) => m.chatId === chatId)
        .sort((a, b) => a.timestamp - b.timestamp)
        .map((msg) => ({
          role: msg.role as "user" | "assistant",
          content: msg.content || "",
        }));

      let assistantMessageId: string | null = null;
      let fullContent = "";
      let currentReasoning = "";
      let currentThinking = "";
      let searchResults: unknown[] = [];
      let sources: string[] = [];

      // Find or create assistant message
      const allMessages = await this.getAllMessages();
      const assistantMsg = allMessages
        .filter((m) => m.chatId === chatId && m.role === "assistant")
        .sort((a, b) => b.timestamp - a.timestamp)[0];

      if (assistantMsg) {
        assistantMessageId = assistantMsg.id;
      } else {
        // Fallback: create one if not found (shouldn't happen)
        const created = await this.addMessage(chatId, {
          role: "assistant",
          content: "",
          isStreaming: true,
        });
        assistantMessageId = created.id;
      }

      // Keep track of what we've yielded to avoid duplicates
      let lastYieldedContent = "";

      // Generate response using AI service with proper onChunk handler
      await this.aiService.generateResponse(
        message,
        chatId,
        // onChunk callback to handle streaming chunks
        async (chunk) => {
          // Handle different chunk types from the SSE stream
          if (chunk.type === "chunk") {
            // Content chunk with potential reasoning/thinking
            if (chunk.content) {
              fullContent += chunk.content;
              // Only yield the new content, not the full accumulated content
              if (chunk.content !== lastYieldedContent) {
                lastYieldedContent = chunk.content;
              }
            }

            // Handle reasoning/thinking from the chunk
            if (chunk.reasoning) {
              currentReasoning += chunk.reasoning;
            }
            if (chunk.thinking) {
              currentThinking = chunk.thinking;
            }

            // Update searchResults and sources if provided
            if (chunk.searchResults) {
              searchResults = chunk.searchResults;
            }
            if (chunk.sources) {
              sources = chunk.sources;
            }

            // Update the message in storage with current state
            if (assistantMessageId) {
              await this.updateMessage(assistantMessageId, {
                content: fullContent,
                reasoning: currentReasoning,
                thinking: currentThinking,
                searchResults,
                sources,
                isStreaming: true,
              });
            }
          } else if (chunk.type === "error") {
            throw new Error(chunk.error || "Streaming error");
          }
        },
        // searchResults parameter (optional)
        undefined,
        // sources parameter (optional)
        undefined,
        // chatHistory for context
        chatHistory,
        // onComplete callback
        async () => {
          // Mark streaming as complete
          if (assistantMessageId) {
            await this.updateMessage(assistantMessageId, {
              content: fullContent,
              reasoning: currentReasoning,
              thinking: "",
              isStreaming: false,
            });
          }
        },
      );

      // After streaming is complete, yield the accumulated data for the UI
      // The UI expects content and metadata to be yielded from this generator
      if (fullContent) {
        yield { type: "content", content: fullContent };
      }

      // Yield final metadata with reasoning
      const finalMetadata: Record<string, unknown> = {};
      if (currentReasoning) {
        finalMetadata.thinking = currentReasoning;
        finalMetadata.reasoning = currentReasoning;
      }
      if (searchResults && searchResults.length > 0) {
        finalMetadata.searchResults = searchResults;
      }
      if (sources && sources.length > 0) {
        finalMetadata.sources = sources;
      }

      if (Object.keys(finalMetadata).length > 0) {
        yield { type: "metadata", metadata: finalMetadata };
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

    // Create share link (mock implementation)
    const shareId = privacy === "shared" ? nanoid() : undefined;
    const publicId = privacy === "public" ? nanoid() : undefined;

    // In a real implementation, this would upload to a server
    logger.info("LocalChatRepository.shareChat", {
      id,
      privacy,
      shareId,
      publicId,
      messageCount: messages.length,
    });

    return { shareId, publicId };
  }

  // Helper methods for unified interface
  toUnifiedChat(chat: LocalChat): UnifiedChat {
    return {
      ...chat,
      _id: chat.id,
      _creationTime: chat.createdAt,
      userId: "local",
      metadata: {},
      source: "local",
      synced: false,
    };
  }

  toUnifiedMessage(message: LocalMessage): UnifiedMessage {
    return {
      ...message,
      _id: message.id,
      _creationTime: message.timestamp,
      userId: "local",
      metadata: {},
      source: "local",
      synced: false,
    };
  }

  // Implement abstract methods
  get type(): "local" {
    return "local";
  }

  get sessionId(): string | null {
    return null;
  }

  async refreshSessionId(): Promise<void> {
    // No session for local storage
  }
}
