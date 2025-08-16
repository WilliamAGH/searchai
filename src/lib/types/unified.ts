/**
 * UI Utilities and Helper Types
 * This file contains ONLY UI-specific utilities and helpers
 * Per AGENT.md: NO database entity types - use Doc<T> from Convex directly
 */

import type { Id } from "../../../convex/_generated/dataModel";
import type { SearchResult } from "./message";

/**
 * Unified message type for repositories
 * Uses 'id' field consistently across all storage backends
 */
export interface UnifiedMessage {
  id: string; // Unified ID field (not _id)
  chatId: string;
  role: "user" | "assistant" | "system";
  content?: string;
  timestamp?: number;

  // Search and AI metadata
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string;
  searchMethod?: "serp" | "openrouter" | "duckduckgo" | "fallback";
  hasRealResults?: boolean;
  isStreaming?: boolean;
  streamedContent?: string;
  thinking?: string;

  // Source tracking
  source?: "local" | "convex";
  synced?: boolean;

  // Original ID fields for compatibility
  _id?: string; // Convex/Local original ID
  _creationTime?: number; // Convex creation time
}

/**
 * Unified chat type for repositories
 * Uses 'id' field consistently across all storage backends
 */
export interface UnifiedChat {
  id: string; // Unified ID field (not _id)
  title?: string;
  createdAt: number;
  updatedAt: number;
  privacy: "private" | "shared" | "public";
  shareId?: string;
  publicId?: string;
  userId?: string;

  // Source tracking
  source?: "local" | "convex";
  synced?: boolean;

  // Original ID fields for compatibility
  _id?: string; // Convex/Local original ID
  _creationTime?: number; // Convex creation time
}

/**
 * Stream chunk for real-time message updates
 */
export interface StreamChunk {
  type: "content" | "metadata" | "error" | "done" | "chunk";
  content?: string;
  thinking?: string;
  reasoning?: string;
  metadata?: Partial<UnifiedMessage>;
  error?: string;
}

/**
 * Chat creation response
 */
export interface ChatResponse {
  chat: UnifiedChat;
  isNew: boolean;
}

/**
 * Operation for offline-first sync (future feature)
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
    // Convex IDs contain '|' character
    return id.includes("|");
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
    return id as Id<"chats">;
  },

  /**
   * Convert string to Convex Message ID (unsafe - only use when certain)
   */
  toConvexMessageId: (id: string): Id<"messages"> => {
    return id as Id<"messages">;
  },

  /**
   * Generate a local ID using UUID v7
   * @deprecated Use UUID v7 directly via generateUuidV7() from utils/uuid.ts
   */
  generateLocalId: (_prefix: "chat" | "msg" = "chat"): string => {
    // Import dynamically to avoid circular dependency
    const { uuidv7 } = require("uuidv7");
    return uuidv7();
  },

  /**
   * Check if ID is a local ID (not from Convex)
   */
  isLocalId: (id: string): boolean => {
    return (
      id.startsWith("chat_") || id.startsWith("msg_") || id.startsWith("local_")
    );
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

    // Check if this is a loading/status message that shouldn't have ellipsis
    const isLoadingMessage =
      /^(Generating|Processing|Searching|Analyzing|Planning|Composing|Loading|Thinking)/i.test(
        trimmed,
      );

    // Try to break at word boundary
    const truncated = trimmed.substring(0, maxLength);
    const lastSpace = truncated.lastIndexOf(" ");

    // Prefer word boundary if it's at least halfway into the truncated text
    if (lastSpace >= Math.floor(maxLength / 2)) {
      // Don't add ellipsis to loading messages
      return isLoadingMessage
        ? truncated.substring(0, lastSpace)
        : truncated.substring(0, lastSpace) + "...";
    }

    // Otherwise just truncate
    // Don't add ellipsis to loading messages
    return isLoadingMessage ? truncated : truncated + "...";
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
