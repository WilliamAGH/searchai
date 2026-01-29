/**
 * UI Utilities and Helper Types
 * This file contains ONLY UI-specific utilities and helpers.
 * Per AGENTS.md: NO database entity types - use Doc<T> from Convex directly.
 */

import type { Id } from "../../../convex/_generated/dataModel";
import { toConvexId as convertToConvexId } from "@/lib/utils/idValidation";
import { generateLocalId as generateLocalIdUtil } from "@/lib/utils/id";

/**
 * ID Conversion Utilities
 * Helper functions for working with Convex IDs
 */
export const IdUtils = {
  /**
   * Check if an ID is a Convex ID
   */
  isConvexId: (id: string): boolean => convertToConvexId(id) !== null,

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
      throw new Error(
        `Invalid Convex chat ID: "${id}" (expected format: j1234567890abcdef)`,
      );
    }
    return safeId;
  },

  /**
   * Convert string to Convex Message ID (unsafe - only use when certain)
   */
  toConvexMessageId: (id: string): Id<"messages"> => {
    const safeId = convertToConvexId<"messages">(id);
    if (!safeId) {
      throw new Error(
        `Invalid Convex message ID: "${id}" (expected format: j1234567890abcdef)`,
      );
    }
    return safeId;
  },

  /**
   * Generate a temporary ID for optimistic messages/chats
   */
  generateLocalId: (prefix: "chat" | "msg"): string => {
    const type = prefix === "chat" ? "chat" : "message";
    return generateLocalIdUtil(type);
  },
};

/**
 * Title Utilities
 * CRITICAL: Title GENERATION is done ONLY by backend convex/chats/utils.ts:generateChatTitle
 * This file contains ONLY sanitization utilities for the frontend.
 */
export const TitleUtils = {
  /**
   * Sanitize title for display
   * Used to clean titles received from backend before displaying
   */
  sanitize: (title: string): string => {
    return title
      .replace(/</g, "") // Remove opening angle brackets to strip tags
      .replace(/\s+/g, " ") // Normalize whitespace
      .trim();
  },
};
