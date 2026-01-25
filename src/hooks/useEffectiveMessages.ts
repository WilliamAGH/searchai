/**
 * Hook for selecting the appropriate message source
 * Handles the complex logic of choosing between unified (optimistic) and paginated messages
 *
 * Priority order:
 * 1. Unified messages when optimistic state is present (streaming/unpersisted)
 * 2. Unified messages when a just-persisted message hasn't synced to paginated yet
 * 3. Paginated messages for authenticated users with DB data
 * 4. Unified messages as fallback
 */

import { useMemo } from "react";
import type { UnifiedMessage, UnifiedChat } from "../lib/types/unified";
import { logger } from "../lib/logger";

interface UseEffectiveMessagesOptions {
  /** Messages from unified chat state (includes optimistic updates) */
  messages: UnifiedMessage[];
  /** Messages from paginated query (DB source of truth) */
  paginatedMessages: UnifiedMessage[];
  /** Whether user is authenticated */
  isAuthenticated: boolean;
  /** Current chat ID */
  currentChatId: string | null;
  /** Current chat object (to check isLocal) */
  currentChat: UnifiedChat | null;
}

/**
 * Selects the appropriate message source based on state
 *
 * This hook solves the race condition between optimistic updates and DB queries:
 * - During generation, unified messages have the streaming content
 * - After generation, paginated messages may lag behind unified
 * - We must show the most up-to-date content without flickering
 */
export function useEffectiveMessages({
  messages,
  paginatedMessages,
  isAuthenticated,
  currentChatId,
  currentChat,
}: UseEffectiveMessagesOptions): UnifiedMessage[] {
  return useMemo(() => {
    // Check if unified messages have optimistic state (isStreaming or unpersisted)
    const hasOptimisticMessages = messages.some(
      (m) => m.isStreaming === true || m.persisted === false,
    );

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    // Extract stable ID from the last assistant message (prefer messageId > _id > id)
    const lastAssistantKey =
      lastAssistantMessage?.messageId ??
      lastAssistantMessage?._id ??
      lastAssistantMessage?.id ??
      null;

    const persistedAssistantMissingInPaginated =
      !!lastAssistantMessage &&
      lastAssistantMessage.persisted === true &&
      !lastAssistantMessage.isStreaming &&
      typeof lastAssistantMessage.content === "string" &&
      lastAssistantMessage.content.length > 0 &&
      // Use ID-based comparison when available, fall back to content comparison
      (lastAssistantKey
        ? !paginatedMessages.some(
            (m) => (m.messageId ?? m._id ?? m.id ?? null) === lastAssistantKey,
          )
        : !paginatedMessages.some(
            (m) =>
              m.role === "assistant" &&
              typeof m.content === "string" &&
              m.content === lastAssistantMessage.content,
          ));

    // If we have optimistic messages (or a just-persisted message not yet in paginated),
    // always use unified messages (source of truth during generation)
    if (hasOptimisticMessages || persistedAssistantMissingInPaginated) {
      logger.debug("Using unified messages - optimistic state present", {
        count: messages.length,
        chatId: currentChatId,
      });
      return messages;
    }

    // Otherwise, use paginated messages if available (for authenticated users with DB data)
    if (
      isAuthenticated &&
      currentChatId &&
      !currentChat?.isLocal &&
      paginatedMessages.length > 0
    ) {
      logger.debug("Using paginated messages - no optimistic state", {
        count: paginatedMessages.length,
        chatId: currentChatId,
      });
      return paginatedMessages;
    }

    // Fallback to unified messages
    logger.debug("Using unified messages - fallback", {
      count: messages.length,
      chatId: currentChatId,
    });
    return messages;
  }, [
    isAuthenticated,
    currentChatId,
    currentChat?.isLocal,
    paginatedMessages,
    messages,
  ]);
}
