/**
 * Chat Repository Interface and Implementation
 * Provides unified access to Convex chat data for all users
 *
 * MIGRATION COMPLETE (Phase 3):
 * - LocalChatRepository deleted
 * - MigrationService deleted
 * - Migration hooks removed
 * - All users (auth + anon) now use Convex directly via sessionId
 *
 * ARCHITECTURE:
 * - ConvexChatRepository is the ONLY implementation
 * - Uses Convex Doc<T> types directly (no wrapper types)
 * - Supports both authenticated users (userId) and anonymous (sessionId)
 * - Repository pattern provides clean abstraction over Convex operations
 */

import type { MessageStreamChunk } from "@/lib/types/message";
import type { CreateChatResult } from "@/lib/types/chat";
import type { Doc } from "../../../convex/_generated/dataModel";
import type {
  SearchResult,
  SerpEnrichment,
} from "../../../convex/schemas/search";

/**
 * Search web response type - mirrors Convex action return type without importing convex/server.
 * This avoids bundling server-side code into client bundles.
 */
export interface SearchWebResponse {
  results: SearchResult[];
  searchMethod: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults: boolean;
  enrichment?: SerpEnrichment;
  providerErrors?: string[] | { provider: string; error: string }[];
  allProvidersFailed?: boolean;
}

/**
 * Base Chat Repository Interface
 * All implementations must follow this contract
 */
export interface IChatRepository {
  // Chat operations
  getChats(): Promise<Doc<"chats">[]>;
  getChatById(id: string): Promise<Doc<"chats"> | null>;
  createChat(title?: string): Promise<CreateChatResult>;
  updateChatTitle(id: string, title: string): Promise<void>;
  updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  deleteChat(id: string): Promise<void>;

  // Message operations
  getMessages(chatId: string): Promise<Doc<"messages">[]>;
  addMessage(
    chatId: string,
    message: Partial<Doc<"messages">>,
  ): Promise<Doc<"messages">>;
  updateMessage(id: string, updates: Partial<Doc<"messages">>): Promise<void>;
  deleteMessage(id: string): Promise<void>;

  // Search and AI operations
  generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<MessageStreamChunk>;
  searchWeb(query: string): Promise<SearchWebResponse>;

  // Sharing operations
  shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  getChatByShareId(shareId: string): Promise<Doc<"chats"> | null>;
  getChatByPublicId(publicId: string): Promise<Doc<"chats"> | null>;

  // Utility
  isAvailable(): boolean;
  getStorageType(): "local" | "convex" | "hybrid";
}

/**
 * Base Repository with shared functionality
 */
export abstract class BaseRepository implements IChatRepository {
  protected abstract storageType: "local" | "convex" | "hybrid";

  /**
   * Update chat title. Subclasses must implement.
   * @param id - Chat ID
   * @param title - New title (will be sanitized)
   * @throws Error if title is empty after sanitization
   */
  abstract updateChatTitle(id: string, title: string): Promise<void>;

  isAvailable(): boolean {
    return true;
  }

  getStorageType(): "local" | "convex" | "hybrid" {
    return this.storageType;
  }

  // Abstract methods that must be implemented
  abstract getChats(): Promise<Doc<"chats">[]>;
  abstract getChatById(id: string): Promise<Doc<"chats"> | null>;
  abstract createChat(title?: string): Promise<CreateChatResult>;
  abstract updateChatPrivacy(
    id: string,
    privacy: "private" | "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  abstract deleteChat(id: string): Promise<void>;

  abstract getMessages(chatId: string): Promise<Doc<"messages">[]>;
  abstract addMessage(
    chatId: string,
    message: Partial<Doc<"messages">>,
  ): Promise<Doc<"messages">>;
  abstract updateMessage(
    id: string,
    updates: Partial<Doc<"messages">>,
  ): Promise<void>;
  abstract deleteMessage(id: string): Promise<void>;

  abstract generateResponse(
    chatId: string,
    message: string,
  ): AsyncGenerator<MessageStreamChunk>;
  abstract searchWeb(query: string): Promise<SearchWebResponse>;

  abstract shareChat(
    id: string,
    privacy: "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string }>;
  abstract getChatByShareId(shareId: string): Promise<Doc<"chats"> | null>;
  abstract getChatByPublicId(publicId: string): Promise<Doc<"chats"> | null>;
}
