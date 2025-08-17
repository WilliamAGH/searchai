/**
 * Repository for managing local chat storage
 * Used for unauthenticated users with browser localStorage
 */

import { nanoid } from "nanoid";
import { uuidv7 } from "uuidv7";
import { ConvexClient } from "convex/browser";
import { api } from "../../../convex/_generated/api";
import type { IChatRepository } from "./ChatRepository";
import type {
  UnifiedChat,
  UnifiedMessage,
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
  private convexClient: ConvexClient;

  constructor(convexUrl?: string) {
    if (!this.isStorageAvailable()) {
      throw new Error("LocalStorage is not available");
    }

    const url = convexUrl || import.meta.env.VITE_CONVEX_URL || "";

    // Initialize AI service with convex URL
    this.aiService = new UnauthenticatedAIService(url);

    // Initialize Convex client for querying public/shared chats
    this.convexClient = new ConvexClient(url);
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
  async getMessages(chatId: string): Promise<UnifiedMessage[]> {
    // First check if this is a local chat
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (stored) {
      const parsed = parseLocalMessages(stored) || [];
      const localMessages = parsed.filter((m) => m.chatId === chatId);

      if (localMessages.length > 0) {
        // Return local messages if found
        const sorted = localMessages.sort(
          (a, b) => (a.timestamp || 0) - (b.timestamp || 0),
        );
        return sorted.map((m) => {
          const { _id, timestamp, ...rest } = m as unknown as {
            _id: string;
            timestamp?: number;
            [key: string]: unknown;
          };
          return {
            id: _id,
            ...(rest as Omit<UnifiedMessage, "id">),
            timestamp: timestamp ?? Date.now(),
            source: "local",
            synced: false,
          } as UnifiedMessage;
        });
      }
    }

    // If no local messages, check if this chat exists in Convex (public/shared chat)
    // This allows viewing messages for public/shared chats
    try {
      const messages = await this.convexClient.query(
        api.chats.getChatMessages,
        { chatId },
      );

      if (messages && messages.length > 0) {
        // Convert Convex messages to UnifiedMessage format
        return messages.map((msg) => ({
          id: msg._id,
          chatId: msg.chatId,
          role: msg.role as "user" | "assistant" | "system",
          content: msg.content || "",
          timestamp: msg.timestamp || msg._creationTime,
          searchResults: msg.searchResults,
          sources: msg.sources,
          reasoning: msg.reasoning,
          searchMethod: msg.searchMethod,
          hasRealResults: msg.hasRealResults,
          isStreaming: msg.isStreaming,
          streamedContent: msg.streamedContent,
          thinking: msg.thinking,
          source: "convex",
          synced: true,
          _id: msg._id,
          _creationTime: msg._creationTime,
        }));
      }
    } catch (error) {
      logger.debug(
        "Failed to query Convex for messages (expected for local chats):",
        error,
      );
    }

    return [];
  }

  private async getAllMessages(): Promise<UnifiedMessage[]> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return [];
    const parsed = parseLocalMessages(stored) || [];
    return parsed.map((m) => {
      const { _id, timestamp, ...rest } = m as unknown as {
        _id: string;
        timestamp?: number;
        [key: string]: unknown;
      };
      return {
        id: _id,
        ...(rest as Omit<UnifiedMessage, "id">),
        timestamp: timestamp ?? Date.now(),
        source: "local",
        synced: false,
      } as UnifiedMessage;
    });
  }

  async addMessage(
    chatId: string,
    message: Partial<UnifiedMessage>,
  ): Promise<UnifiedMessage> {
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
    } as unknown as {
      _id: string;
      chatId: string;
      role: string;
      content: string;
      timestamp: number;
      isLocal: boolean;
      source: string;
    };

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
    const { _id, timestamp, ...rest } = raw as {
      _id: string;
      [k: string]: unknown;
    };
    return {
      id: _id,
      ...(rest as Omit<UnifiedMessage, "id">),
      timestamp: (timestamp as number) ?? now,
      source: "local",
      synced: false,
    } as UnifiedMessage;
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
    updates: Partial<UnifiedMessage>,
  ): Promise<void> {
    const stored = localStorage.getItem(MESSAGES_KEY);
    if (!stored) return;
    const all = parseLocalMessages(stored) || [];
    let changed = false;
    for (const msg of all) {
      if (msg._id === id) {
        const {
          id: _ignoreId,
          _id: _ignoreLegacyId,
          chatId: _ignoreChatId,
          _creationTime: _ignoreCreation,
          ...safe
        } = (updates || {}) as Record<string, unknown>;
        Object.assign(msg as Record<string, unknown>, safe);
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

      // Always create a new assistant message for each response
      // This prevents overwriting previous responses if multiple streams happen
      const created = await this.addMessage(chatId, {
        role: "assistant",
        content: "",
        isStreaming: true,
      });
      assistantMessageId = created.id;

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
              // Incremental UI updates are driven by updateMessage() writes
            }

            // Handle reasoning/thinking from the chunk
            if (chunk.reasoning) {
              currentReasoning += chunk.reasoning;
            }
            if (chunk.thinking) {
              currentThinking += chunk.thinking;
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
              thinking: currentThinking,
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

      // Yield final metadata with reasoning and thinking
      const finalMetadata: Record<string, unknown> = {};
      if (currentReasoning) {
        finalMetadata.reasoning = currentReasoning;
      }
      if (currentThinking) {
        finalMetadata.thinking = currentThinking;
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

    // Create share/public IDs using UUID v7 (same format as Convex backend)
    const shareId = privacy === "shared" ? uuidv7() : undefined;
    const publicId = privacy === "public" ? uuidv7() : undefined;

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

  // Missing IChatRepository methods
  async getChatByShareId(shareId: string): Promise<UnifiedChat | null> {
    // First check localStorage
    const stored = localStorage.getItem(CHATS_KEY);
    if (stored) {
      const parsed = parseLocalChats(stored) || [];
      const localChat = parsed.find((c) => c.shareId === shareId);
      if (localChat) {
        return {
          id: localChat._id,
          title: localChat.title,
          createdAt: localChat.createdAt,
          updatedAt: localChat.updatedAt,
          privacy: localChat.privacy,
          shareId: localChat.shareId,
          publicId: localChat.publicId,
          source: "local",
          synced: false,
        };
      }
    }

    // If not found locally, query Convex for shared chats
    // This allows unauthenticated users to view shared chats
    try {
      const convexChat = await this.convexClient.query(
        api.chats.getChatByShareId,
        { shareId },
      );

      if (convexChat) {
        // Convert Convex chat to UnifiedChat format
        return {
          id: convexChat._id,
          title: convexChat.title || "Untitled Chat",
          createdAt: convexChat.createdAt || convexChat._creationTime,
          updatedAt: convexChat.updatedAt || convexChat._creationTime,
          privacy: convexChat.privacy || "shared",
          shareId: convexChat.shareId,
          publicId: convexChat.publicId,
          source: "convex",
          synced: true,
          _id: convexChat._id,
          _creationTime: convexChat._creationTime,
        };
      }
    } catch (error) {
      logger.error("Failed to query Convex for shared chat:", error);
    }

    return null;
  }

  async getChatByPublicId(publicId: string): Promise<UnifiedChat | null> {
    // First check localStorage
    const stored = localStorage.getItem(CHATS_KEY);
    if (stored) {
      const parsed = parseLocalChats(stored) || [];
      const localChat = parsed.find((c) => c.publicId === publicId);
      if (localChat) {
        return {
          id: localChat._id,
          title: localChat.title,
          createdAt: localChat.createdAt,
          updatedAt: localChat.updatedAt,
          privacy: localChat.privacy,
          shareId: localChat.shareId,
          publicId: localChat.publicId,
          source: "local",
          synced: false,
        };
      }
    }

    // If not found locally, query Convex for public chats
    // This allows unauthenticated users to view public chats
    try {
      const convexChat = await this.convexClient.query(
        api.chats.getChatByPublicId,
        { publicId },
      );

      if (convexChat) {
        // Convert Convex chat to UnifiedChat format
        return {
          id: convexChat._id,
          title: convexChat.title || "Untitled Chat",
          createdAt: convexChat.createdAt || convexChat._creationTime,
          updatedAt: convexChat.updatedAt || convexChat._creationTime,
          privacy: convexChat.privacy || "public",
          shareId: convexChat.shareId,
          publicId: convexChat.publicId,
          source: "convex",
          synced: true,
          _id: convexChat._id,
          _creationTime: convexChat._creationTime,
        };
      }
    } catch (error) {
      logger.error("Failed to query Convex for public chat:", error);
    }

    return null;
  }

  async updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<void> {
    const stored = localStorage.getItem(CHATS_KEY);
    if (!stored) return;
    const chats = parseLocalChats(stored) || [];
    const chat = chats.find((c) => c._id === id);
    if (chat) {
      chat.privacy = privacy;
      chat.updatedAt = Date.now();

      // Generate share/public IDs if needed
      if (privacy === "shared" && !chat.shareId) {
        chat.shareId = `share_${nanoid()}`;
      }
      if (privacy === "public" && !chat.publicId) {
        chat.publicId = `public_${nanoid()}`;
      }

      localStorage.setItem(CHATS_KEY, JSON.stringify(chats));
    }
  }

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
    // Convert UnifiedChat to LocalChat format for storage
    const localChats = data.chats.map((chat) => ({
      _id: chat.id,
      title: chat.title || "Imported Chat",
      createdAt: chat.createdAt,
      updatedAt: chat.updatedAt,
      privacy: chat.privacy,
      shareId: chat.shareId,
      publicId: chat.publicId,
    }));

    // Convert UnifiedMessage to local storage format
    const localMessages = data.messages.map((msg) => ({
      _id: msg.id,
      chatId: msg.chatId,
      role: msg.role,
      content: msg.content,
      timestamp: msg.timestamp || Date.now(),
      searchResults: msg.searchResults,
      sources: msg.sources,
      reasoning: msg.reasoning,
      searchMethod: msg.searchMethod,
      hasRealResults: msg.hasRealResults,
    }));

    // Merge with existing data
    const existingChatsStr = localStorage.getItem(CHATS_KEY);
    const existingChats = existingChatsStr
      ? parseLocalChats(existingChatsStr) || []
      : [];
    const existingMessagesStr = localStorage.getItem(MESSAGES_KEY);
    const existingMessages = existingMessagesStr
      ? parseLocalMessages(existingMessagesStr) || []
      : [];

    // Deduplicate by ID
    const chatIds = new Set(existingChats.map((c) => c._id));
    const newChats = localChats.filter((c) => !chatIds.has(c._id));

    const messageIds = new Set(existingMessages.map((m) => m._id));
    const newMessages = localMessages.filter((m) => !messageIds.has(m._id));

    // Save merged data
    localStorage.setItem(
      CHATS_KEY,
      JSON.stringify([...existingChats, ...newChats]),
    );
    localStorage.setItem(
      MESSAGES_KEY,
      JSON.stringify([...existingMessages, ...newMessages]),
    );
  }

  isAvailable(): boolean {
    return this.isStorageAvailable();
  }

  getStorageType(): "local" | "convex" | "hybrid" {
    return "local";
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
