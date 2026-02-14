/**
 * Combines paginated message loading, effective-message selection,
 * and user-history derivation into a single hook.
 *
 * Extracted from ChatInterface/index.tsx to keep the orchestrator
 * under the 350-line LOC limit.
 */

import { useCallback, useMemo } from "react";
import { usePaginatedMessages } from "@/hooks/usePaginatedMessages";
import { useEffectiveMessages } from "@/hooks/useEffectiveMessages";
import { buildUserHistory } from "@/lib/utils/chatHistory";
import type { Message } from "@/lib/types/message";

interface UseChatPaginatedMessagesOptions {
  currentChatId: string | null;
  isAuthenticated: boolean;
  messages: Message[];
}

export function useChatPaginatedMessages({
  currentChatId,
  isAuthenticated,
  messages,
}: UseChatPaginatedMessagesOptions) {
  const usePagination = isAuthenticated && !!currentChatId;

  const {
    messages: paginatedMessages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    hasMore,
    error: loadError,
    retryCount,
    loadMore,
    clearError,
  } = usePaginatedMessages({
    chatId: usePagination ? currentChatId : null,
    enabled: usePagination,
  });

  const handlePaginatedLoadMore = useCallback(async () => {
    await loadMore();
  }, [loadMore]);

  const pagination = useMemo(
    () => ({
      isLoadingMore,
      hasMore,
      onLoadMore: handlePaginatedLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      onClearError: clearError,
    }),
    [
      isLoadingMore,
      hasMore,
      handlePaginatedLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      clearError,
    ],
  );

  const effectiveMessages = useEffectiveMessages({
    messages,
    paginatedMessages,
    currentChatId,
    preferPaginatedSource: usePagination,
    isPaginatedLoading: isLoadingMessages,
  });

  const userHistory = useMemo(
    () => buildUserHistory(effectiveMessages),
    [effectiveMessages],
  );

  return { effectiveMessages, pagination, userHistory };
}
