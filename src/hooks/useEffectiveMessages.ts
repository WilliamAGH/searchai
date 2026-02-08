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

export interface UseEffectiveMessagesOptions {
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

/** Whether unified messages should take priority due to optimistic state or sync gap */
function hasUnifiedPriority(
  unifiedMessages: Message[],
  paginatedMessages: Message[],
): boolean {
  const hasOptimistic = unifiedMessages.some(
    (m) => m.isStreaming === true || m.persisted === false,
  );
  if (hasOptimistic) return true;

  // Check if a just-persisted assistant message hasn't synced to paginated yet
  const lastAssistant = [...unifiedMessages]
    .reverse()
    .find((m) => m.role === "assistant");

  if (!lastAssistant) return false;
  if (lastAssistant.persisted !== true || lastAssistant.isStreaming)
    return false;
  if (
    typeof lastAssistant.content !== "string" ||
    lastAssistant.content.length === 0
  )
    return false;

  const key = lastAssistant._id ?? null;
  return key
    ? !paginatedMessages.some((m) => m._id === key)
    : !paginatedMessages.some(
        (m) =>
          m.role === "assistant" &&
          typeof m.content === "string" &&
          m.content === lastAssistant.content,
      );
}

/** Resolve the preferred paginated source, considering loading state */
function selectPaginatedSource(params: {
  safeUnified: Message[];
  safePaginated: Message[];
  isPaginatedLoading: boolean;
  chatId: string | null;
}): Message[] | null {
  if (params.safePaginated.length > 0) {
    logger.debug("Using paginated messages - preferred source", {
      count: params.safePaginated.length,
      chatId: params.chatId,
    });
    return params.safePaginated;
  }

  if (params.isPaginatedLoading) {
    if (params.safeUnified.length > 0) {
      logger.debug("Using unified messages while paginated source is loading", {
        count: params.safeUnified.length,
        chatId: params.chatId,
      });
      return params.safeUnified;
    }
    logger.debug("Using paginated loading state", { chatId: params.chatId });
    return [];
  }

  return null;
}

export function selectEffectiveMessages({
  messages,
  paginatedMessages,
  currentChatId,
  preferPaginatedSource = false,
  isPaginatedLoading = false,
}: UseEffectiveMessagesOptions): Message[] {
  const safeUnified = currentChatId
    ? messages.filter((m) => m.chatId === currentChatId)
    : messages;

  const safePaginated = currentChatId
    ? paginatedMessages.filter((m) => m.chatId === currentChatId)
    : paginatedMessages;

  if (hasUnifiedPriority(safeUnified, safePaginated)) {
    logger.debug("Using unified messages - optimistic state present", {
      count: safeUnified.length,
      chatId: currentChatId,
    });
    return safeUnified;
  }

  if (preferPaginatedSource) {
    const result = selectPaginatedSource({
      safeUnified,
      safePaginated,
      isPaginatedLoading,
      chatId: currentChatId,
    });
    if (result !== null) return result;
  }

  if (currentChatId && safePaginated.length > 0) {
    logger.debug("Using paginated messages - no optimistic state", {
      count: safePaginated.length,
      chatId: currentChatId,
    });
    return safePaginated;
  }

  logger.debug("Using unified messages - fallback", {
    count: safeUnified.length,
    chatId: currentChatId,
  });
  return safeUnified;
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
  return useMemo(
    () =>
      selectEffectiveMessages({
        messages,
        paginatedMessages,
        currentChatId,
        preferPaginatedSource,
        isPaginatedLoading,
      }),
    [
      currentChatId,
      isPaginatedLoading,
      messages,
      paginatedMessages,
      preferPaginatedSource,
    ],
  );
}
