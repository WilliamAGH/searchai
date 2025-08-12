/**
 * Chat Repository Interface and Implementations
 * Provides unified access to chat data regardless of storage backend
 */

import {
  UnifiedChat,
  UnifiedMessage,
  StreamChunk,
  ChatResponse,
  IdUtils,
  TitleUtils,
} from "../types/unified";

/**
 * Base Chat Repository Interface
 * All implementations must follow this contract
 */
export interface IChatRepository {
  // Chat operations
  getChats(): Promise<UnifiedChat[]>;
  getChatById(id: string): Promise<UnifiedChat | null>;
  createChat(title?: string): Promise<ChatResponse>;
  updateChatTitle(id: string, title: string): Promise<void>;
  updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<void>;
  deleteChat(id: string): Promise<void>;

  // Message operations
  getMessages(chatId: string): Promise<UnifiedMessage[]>;
  addMessage(
    chatId: string,
    message: Partial<UnifiedMessage>,
  ): Promise<UnifiedMessage>;
  updateMessage(id: string, updates: Partial<UnifiedMessage>): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  // Search and AI operations
  generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk>;
  searchWeb(query: string): Promise<unknown>;

  // Sharing operations
  shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  getChatByShareId(shareId: string): Promise<UnifiedChat | null>;
  getChatByPublicId(publicId: string): Promise<UnifiedChat | null>;

  // Migration and sync
  exportData(): Promise<{ chats: UnifiedChat[]; messages: UnifiedMessage[] }>;
  importData(data: {
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }): Promise<void>;

  // Utility
  isAvailable(): boolean;
  getStorageType(): "local" | "convex" | "hybrid";
}

/**
 * Base Repository with shared functionality
 */
export abstract class BaseRepository implements IChatRepository {
  protected abstract storageType: "local" | "convex" | "hybrid";

  // Default implementations that can be overridden
  async createChat(title?: string): Promise<ChatResponse> {
    const finalTitle = title || "New Chat";
    const chat: UnifiedChat = {
      id: IdUtils.generateLocalId("chat"),
      title: TitleUtils.sanitize(finalTitle),
      createdAt: Date.now(),
      updatedAt: Date.now(),
      privacy: "private",
      source: this.storageType === "convex" ? "convex" : "local",
      synced: this.storageType === "convex",
    };

    // Subclasses implement actual storage
    return { chat, isNew: true };
  }

  async updateChatTitle(id: string, title: string): Promise<void> {
    const sanitized = TitleUtils.sanitize(title);
    if (!sanitized) throw new Error("Title cannot be empty");

    // Subclasses implement actual storage update
    throw new Error("Not implemented");
  }

  isAvailable(): boolean {
    return true;
  }

  getStorageType(): "local" | "convex" | "hybrid" {
    return this.storageType;
  }

  // Abstract methods that must be implemented
  abstract getChats(): Promise<UnifiedChat[]>;
  abstract getChatById(id: string): Promise<UnifiedChat | null>;
  abstract updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<void>;
  abstract deleteChat(id: string): Promise<void>;

  abstract getMessages(chatId: string): Promise<UnifiedMessage[]>;
  abstract addMessage(
    chatId: string,
    message: Partial<UnifiedMessage>,
  ): Promise<UnifiedMessage>;
  abstract updateMessage(
    id: string,
    updates: Partial<UnifiedMessage>,
  ): Promise<void>;
  abstract deleteMessage(id: string): Promise<void>;

  abstract generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<StreamChunk>;
  abstract searchWeb(query: string): Promise<unknown>;

  abstract shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  abstract getChatByShareId(shareId: string): Promise<UnifiedChat | null>;
  abstract getChatByPublicId(publicId: string): Promise<UnifiedChat | null>;

  abstract exportData(): Promise<{
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }>;
  abstract importData(data: {
    chats: UnifiedChat[];
    messages: UnifiedMessage[];
  }): Promise<void>;
}
