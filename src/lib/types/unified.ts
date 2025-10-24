/**
 * UI Utilities and Helper Types
 * This file contains ONLY UI-specific utilities and helpers
 * Per AGENT.md: NO database entity types - use Doc<T> from Convex directly
 *
 * MIGRATION NOTE: UnifiedChat and UnifiedMessage types below are TEMPORARY bridge types
 * for the localStorage → Convex migration. They will be removed once migration is complete.
 */

import type { Id } from "../../../convex/_generated/dataModel";
import type { SearchResult } from "./message";
import { toConvexId as convertToConvexId } from "../utils/idValidation";

/**
 * Unified Chat - Bridge type for local/Convex chats during migration
 *
 * This type allows repositories to work with both localStorage chats (local IDs)
 * and Convex chats (Convex IDs) during the migration period.
 *
 * @deprecated This is a temporary bridge type for localStorage → Convex migration.
 * Target removal: 6 months after migration completes (when localStorage usage < 5%).
 * FUTURE: Replace all usage with Doc<"chats"> from convex/_generated/dataModel
 */
export interface UnifiedChat {
  // ID can be either local (string) or Convex (Id<"chats">)
  id?: string | Id<"chats">;
  _id?: string | Id<"chats">;

  // Core fields (match Convex schema)
  title: string;
  createdAt: number;
  updatedAt: number;
  privacy?: "private" | "shared" | "public";

  // Optional fields
  shareId?: string;
  publicId?: string;
  userId?: Id<"users"> | string;
  threadId?: string;
  rollingSummary?: string;
  rollingSummaryUpdatedAt?: number;

  // Migration tracking fields
  source?: "local" | "convex";
  synced?: boolean;
  isLocal?: boolean;

  // Convex system fields
  _creationTime?: number;
}

/**
 * Unified Message - Bridge type for local/Convex messages during migration
 *
 * This type allows repositories to work with both localStorage messages (local IDs)
 * and Convex messages (Convex IDs) during the migration period.
 *
 * @deprecated This is a temporary bridge type for localStorage → Convex migration.
 * Target removal: 6 months after migration completes (when localStorage usage < 5%).
 * FUTURE: Replace all usage with Doc<"messages"> from convex/_generated/dataModel
 */
export interface UnifiedMessage {
  // ID can be either local (string) or Convex (Id<"messages">)
  id?: string | Id<"messages">;
  _id?: string | Id<"messages">;

  // Core fields (match Convex schema)
  chatId: string | Id<"chats">;
  role: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;

  // Search and AI fields
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string | unknown; // may be string or structured reasoning from agents
  searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults?: boolean;

  // Streaming fields
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;

  // Migration tracking fields
  source?: "local" | "convex";
  synced?: boolean;

  // Convex system fields
  _creationTime?: number;

  // UUID v7 tracking
  messageId?: string;
  threadId?: string;

  // Context references (from agent workflow)
  contextReferences?: Array<{
    contextId: string;
    type: "search_result" | "scraped_page" | "research_summary";
    url?: string;
    title?: string;
    timestamp: number;
    relevanceScore?: number;
    metadata?: unknown;
  }>;

  // Agent workflow tracking
  workflowId?: string;
}

/**
 * Chat creation response
 *
 * @deprecated This is a temporary bridge type for localStorage → Convex migration.
 * FUTURE: Return Doc<"chats"> directly instead of wrapping it
 */
export interface ChatResponse {
  chat: UnifiedChat;
  isNew: boolean;
}

/**
 * Stream chunk type alias
 *
 * @deprecated Use MessageStreamChunk directly from types/message.ts
 */
export type StreamChunk = import("./message").MessageStreamChunk;
export type PersistedPayload = import("./message").PersistedPayload;

/**
 * Operation for offline-first sync (future feature)
 *
 * @deprecated Planned for offline-first sync feature. Remove if not implemented in next 2 releases.
 */
export interface Operation {
  type: "create" | "update" | "delete";
  entity: "chat" | "message";
  data: Record<string, unknown>;
  timestamp: number;
  retryCount?: number;
}

/**
 * Migration Result for localStorage to Convex migration
 */
export interface MigrationResult {
  success: boolean;
  migrated: number;
  failed: number;
  errors?: string[];
  mapping?: Map<string, string>; // oldId -> newId
}

/**
 * ID Conversion Utilities
 * Helper functions for working with Convex IDs
 */
export const IdUtils = {
  /**
   * Check if an ID is a Convex ID
   */
  isConvexId: (id: string): boolean => {
    return !IdUtils.isLocalId(id);
  },

  /**
   * Convert any ID to unified string format
   */
  toUnifiedId: (id: Id<"chats"> | Id<"messages"> | string): string => {
    return String(id);
  },

  /**
   * Convert string to Convex ID (unsafe - only use when certain)
   */
  toConvexChatId: (id: string): Id<"chats"> => {
    const safeId = convertToConvexId<"chats">(id);
    if (!safeId) {
      throw new Error("Invalid Convex chat ID");
    }
    return safeId;
  },

  /**
   * Convert string to Convex Message ID (unsafe - only use when certain)
   */
  toConvexMessageId: (id: string): Id<"messages"> => {
    const safeId = convertToConvexId<"messages">(id);
    if (!safeId) {
      throw new Error("Invalid Convex message ID");
    }
    return safeId;
  },

  /**
   * Check if ID is a local ID (not from Convex)
   */
  isLocalId: (id: string): boolean => {
    return (
      id.startsWith("chat_") || id.startsWith("msg_") || id.startsWith("local_")
    );
  },

  /**
   * Generate a local ID for temporary messages/chats
   */
  generateLocalId: (prefix: "chat" | "msg"): string => {
    return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  },
};

/**
 * Title Generation Utilities
 * Helper functions for generating and sanitizing titles
 */
export const TitleUtils = {
  /**
   * Generate a title from content
   */
  generateFromContent: (content: string, maxLength: number = 50): string => {
    const trimmed = content.trim();
    if (!trimmed) return "New Chat";

    if (trimmed.length <= maxLength) {
      return trimmed;
    }

    // Try to break at word boundary
    const truncated = trimmed.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    // Prefer word boundary if it's at least halfway into the truncated text
    if (lastSpace >= Math.floor(maxLength / 2)) {
      return truncated.substring(0, lastSpace) + "...";
    }

    // Otherwise just truncate
    return truncated + "...";
  },

  /**
   * Sanitize title for display
   */
  sanitize: (title: string): string => {
    return title
      .replace(/</g, "") // Remove opening angle brackets to strip tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  },
};

/**
 * Storage Type Detection
 * Utilities for determining storage backend
 */
export const StorageUtils = {
  /**
   * Detect optimal storage type based on auth status
   */
  getStorageType: (isAuthenticated: boolean): "local" | "convex" | "hybrid" => {
    if (!isAuthenticated) return "local";

    // In future, we could check for offline mode here
    // if (isAuthenticated && navigator.onLine === false) return 'hybrid';

    return "convex";
  },

  /**
   * Check if browser supports localStorage
   */
  hasLocalStorage: (): boolean => {
    try {
      const test = "__storage_test__";
      localStorage.setItem(test, test);
      localStorage.removeItem(test);
      return true;
    } catch {
      return false;
    }
  },
};

// Feature flags removed - not being used in the codebase
