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
import { TitleUtils } from "../types/unified";
import { createLocalChat } from "../types/chat";

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
    // Sanitize title and create a LocalChat using shared utility
    const sanitized = title ? TitleUtils.sanitize(title) : "New Chat";
    const localChat = createLocalChat(sanitized);

    // Persist raw LocalChat array in localStorage
    const stored = localStorage.getItem(CHATS_KEY);
    const chats = stored ? parseLocalChats(stored) || [] : [];
    chats.unshift(localChat);
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));

    // Convert to UnifiedChat for response (id maps from _id)
    const unifiedChat: UnifiedChat = {
      id: localChat._id,
      title: localChat.title,
      createdAt: localChat.createdAt,
      updatedAt: localChat.updatedAt,
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

    // Convert LocalChat[] to UnifiedChat[] (map _id -> id)
    return parsed.map((chat) => ({
      id: chat._id,
      title: chat.title,
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      privacy: "private" as const,
      source: "local" as const,
      synced: false,
      isLocal: true,
      messages: [],
    }));
  }

  async getChatById(id: string): Promise<UnifiedChat | null> {
    const chats = await this.getChats();
    return chats.find((c) => c.id === id) || null;
  }

  async deleteChat(id: string): Promise<void> {
    // Remove chat from raw LocalChat array
    const stored = localStorage.getItem(CHATS_KEY);
    if (stored) {
      const parsed = parseLocalChats(stored) || [];
      const filtered = parsed.filter((c) => c._id !== id);
      localStorage.setItem(CHATS_KEY, JSON.stringify(filtered));
    }

    // Also remove messages for this chat from the single messages array
    const msgStored = localStorage.getItem(MESSAGES_KEY);
    if (msgStored) {
      const all = parseLocalMessages(msgStored) || [];
      const remaining = all.filter((m) => m.chatId !== id);
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(remaining));
    }
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const stored = localStorage.getItem(CHATS_KEY);
    const chats = stored ? parseLocalChats(stored) || [] : [];
    const chat = chats.find((c) => c._id === id);
    if (!chat) throw new Error(`Chat ${id} not found`);

    chat.title = TitleUtils.sanitize(title);
    chat.updatedAt = Date.now();
    localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
  }

  // Message operations
  async getMessages(chatId: string): Promise<LocalMessage[]> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return [];
    const parsed = parseLocalMessages(stored) || [];

    // Filter by chat and sort ascending by timestamp
    const filtered = parsed
      .filter((m) => m.chatId === chatId)
      .sort((a, b) => (a.timestamp || 0) - (b.timestamp || 0));

    // Map stored _id -> returned id shape expected by callers/tests
    return filtered.map((m) => {
      const { _id, ...rest } = m as unknown as { _id: string; [key: string]: unknown };
      return { id: _id, ...rest } as unknown as LocalMessage;
    });
  }

  private async getAllMessages(): Promise<LocalMessage[]> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return [];
    const parsed = parseLocalMessages(stored) || [];
    return parsed.map((m) => {
      const { _id, ...rest } = m as unknown as { _id: string; [key: string]: unknown };
      return { id: _id, ...rest } as unknown as LocalMessage;
    });
  }

  async addMessage(
    chatId: string,
    message: Partial<LocalMessage>,
  ): Promise<LocalMessage> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    const allRaw = stored ? parseLocalMessages(stored) || [] : [];

    const id = nanoid();
    const now = Date.now();

    // Create raw stored message (with _id)
    const raw = {
      _id: id,
      chatId,
      role: message.role || "user",
      content: message.content || "",
      timestamp: message.timestamp ?? now,
      isLocal: true as const,
      source: "local" as const,
      ...(message as object),
    } as unknown as { _id: string; chatId: string; role: string; content: string; timestamp: number; isLocal: boolean; source: string };

    allRaw.push(raw);
    localStorage.setItem(MESSAGES_KEY, JSON.stringify(allRaw));

    // Update chat's updatedAt in raw chats storage
    const chatsStored = localStorage.getItem(CHATS_KEY);
    if (chatsStored) {
      const chats = parseLocalChats(chatsStored) || [];
      const chat = chats.find((c) => c._id === chatId);
      if (chat) {
        chat.updatedAt = now;
        localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
      }
    }

    // Return API shape with id (mapped from _id)
    const { _id, ...rest } = raw;
    return { id: _id, ...rest } as unknown as LocalMessage;
  }

  async deleteMessage(id: string): Promise<void> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return;
    const all = parseLocalMessages(stored) || [];
    const remaining = all.filter((m) => m._id !== id);
    if (remaining.length !== all.length) {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(remaining));
    }
  }

  async updateMessage(
    id: string,
    updates: Partial<LocalMessage>,
  ): Promise<void> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return;
    const all = parseLocalMessages(stored) || [];
    let changed = false;
    for (const msg of all) {
      if (msg._id === id) {
        Object.assign(msg as unknown as Record<string, unknown>, updates);
        changed = true;
        break;
      }
    }
    if (changed) {
      localStorage.setItem(MESSAGES_KEY, JSON.stringify(all));
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
  ): Promise<{ shareId?: string; publicId?: string }>
  {
    const chat = await this.getChatById(id);
    if (!chat) throw new Error(`Chat ${id} not found`);

    const messages = await this.getMessages(id);

    // Create share/public IDs with expected prefixes
    const shareId = privacy === "shared" ? `s_${nanoid()}` : undefined;
    const publicId = privacy === "public" ? `p_${nanoid()}` : undefined;

    // Persist privacy + share identifiers back into raw chats storage
    const stored = localStorage.getItem(CHATS_KEY);
    if (stored) {
      const chats = parseLocalChats(stored) || [];
      const target = chats.find((c) => c._id === id);
      if (target) {
        target.privacy = privacy;
        if (shareId) target.shareId = shareId;
        if (publicId) target.publicId = publicId;
        localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
      }
    }

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
