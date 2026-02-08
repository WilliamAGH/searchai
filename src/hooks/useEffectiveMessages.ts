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
import type { Message } from "@/lib/types/message";
import { logger } from "@/lib/logger";

interface UseEffectiveMessagesOptions {
  /** Messages from unified chat state (includes optimistic updates) */
  messages: Message[];
  /** Messages from paginated query (DB source of truth) */
  paginatedMessages: Message[];
  /** Current chat ID */
  currentChatId: string | null;
  /** Whether pagination should be the primary source for this view */
  preferPaginatedSource?: boolean;
  /** Whether paginated messages are still loading */
  isPaginatedLoading?: boolean;
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
  currentChatId,
  preferPaginatedSource = false,
  isPaginatedLoading = false,
}: UseEffectiveMessagesOptions): Message[] {
  return useMemo(() => {
    const safePaginatedMessages = currentChatId
      ? paginatedMessages.filter((m) => m.chatId === currentChatId)
      : paginatedMessages;

    // Check if unified messages have optimistic state (isStreaming or unpersisted)
    const hasOptimisticMessages = messages.some(
      (m) => m.isStreaming === true || m.persisted === false,
    );

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");

    // Extract stable ID from the last assistant message
    const lastAssistantKey = lastAssistantMessage?._id ?? null;

    const persistedAssistantMissingInPaginated =
      !!lastAssistantMessage &&
      lastAssistantMessage.persisted === true &&
      !lastAssistantMessage.isStreaming &&
      typeof lastAssistantMessage.content === "string" &&
      lastAssistantMessage.content.length > 0 &&
      // Use ID-based comparison when available, fall back to content comparison
      (lastAssistantKey
        ? !safePaginatedMessages.some((m) => m._id === lastAssistantKey)
        : !safePaginatedMessages.some(
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

    if (preferPaginatedSource) {
      if (safePaginatedMessages.length > 0) {
        logger.debug("Using paginated messages - preferred source", {
          count: safePaginatedMessages.length,
          chatId: currentChatId,
        });
        return safePaginatedMessages;
      }

      if (isPaginatedLoading) {
        logger.debug("Using paginated loading state", {
          chatId: currentChatId,
        });
        return [];
      }
    }

    // Otherwise, use paginated messages if available
    if (currentChatId && safePaginatedMessages.length > 0) {
      logger.debug("Using paginated messages - no optimistic state", {
        count: safePaginatedMessages.length,
        chatId: currentChatId,
      });
      return safePaginatedMessages;
    }

    // Fallback to unified messages
    logger.debug("Using unified messages - fallback", {
      count: messages.length,
      chatId: currentChatId,
    });
    return messages;
  }, [
    currentChatId,
    isPaginatedLoading,
    messages,
    paginatedMessages,
    preferPaginatedSource,
  ]);
}
