/**
 * UI Utilities and Helper Types
 * This file contains ONLY UI-specific utilities and helpers
 * Per AGENT.md: NO database entity types - use Doc<T> from Convex directly
 */

import { Id } from "../../../convex/_generated/dataModel";

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
