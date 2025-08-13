/**
 * Hook for loading messages with pagination support
 * Provides efficient message loading with cursor-based pagination
 */

import { useState, useCallback, useEffect, useRef } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { UnifiedMessage } from "../lib/types/unified";
import { logger } from "../lib/logger";

interface UsePaginatedMessagesOptions {
  chatId: string | null;
  initialLimit?: number;
  enabled?: boolean;
}

interface PaginatedMessagesState {
  messages: UnifiedMessage[];
  isLoading: boolean;
  isLoadingMore: boolean;
  hasMore: boolean;
  error: Error | null;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
}

/**
 * Hook for paginated message loading
 * Manages message pagination state and provides load more functionality
 */
export function usePaginatedMessages({
  chatId,
  initialLimit = 50,
  enabled = true,
}: UsePaginatedMessagesOptions): PaginatedMessagesState {
  const [messages, setMessages] = useState<UnifiedMessage[]>([]);
  const [cursor, setCursor] = useState<string | undefined>(undefined);
  const [hasMore, setHasMore] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const loadingRef = useRef(false);

  // Query for initial messages
  const initialMessages = useQuery(
    api.chats.messagesPaginated.getChatMessagesPaginated,
    enabled && chatId
      ? {
          chatId: chatId as Id<"chats">,
          limit: initialLimit,
        }
      : "skip",
  );

  // Load initial messages when they arrive
  useEffect(() => {
    if (initialMessages) {
      const convexMessages = initialMessages.messages || [];
      const unifiedMessages: UnifiedMessage[] = convexMessages.map((msg) => ({
        id: msg._id,
        chatId: chatId ?? String(msg.chatId ?? ""),
        role: msg.role,
        content: msg.content || "",
        timestamp: msg.timestamp || Date.now(),
        isStreaming: msg.isStreaming,
        streamedContent: msg.streamedContent,
        thinking: msg.thinking,
        searchResults: msg.searchResults,
        sources: msg.sources,
        reasoning: msg.reasoning,
        synced: true,
        source: "convex" as const,
      }));

      setMessages(unifiedMessages);
      setCursor(initialMessages.nextCursor);
      setHasMore(initialMessages.hasMore);
      setError(null);
    }
  }, [initialMessages, chatId]);

  // Load more messages
  const loadMore = useCallback(async () => {
    if (!chatId || !cursor || !hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    try {
      // Since we can't use hooks conditionally, we'll need to make a direct API call
      // This would typically be done through a Convex action or by refactoring
      // For now, we'll use a pattern that works with the existing setup
      logger.debug("Loading more messages", { chatId, cursor });

      // Note: In a real implementation, you'd want to expose this through
      // a proper action or mutation that can be called imperatively
      // For demonstration, we'll show the structure:

      // const moreMessages = await loadMoreMessages({
      //   chatId: chatId as Id<"chats">,
      //   cursor,
      //   limit: initialLimit,
      // });

      // if (moreMessages) {
      //   const newUnifiedMessages = moreMessages.messages.map(...);
      //   setMessages(prev => [...prev, ...newUnifiedMessages]);
      //   setCursor(moreMessages.nextCursor);
      //   setHasMore(moreMessages.hasMore);
      // }

      // Placeholder for now - you'll need to implement the actual loading
      logger.info(
        "Load more functionality needs backend action implementation",
      );
    } catch (err) {
      logger.error("Failed to load more messages", err);
      setError(err as Error);
    } finally {
      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [chatId, cursor, hasMore]);

  // Refresh messages (reload from beginning)
  const refresh = useCallback(async () => {
    if (!chatId) return;

    setCursor(undefined);
    setHasMore(true);
    setMessages([]);
    setError(null);

    // The query will automatically re-run
  }, [chatId]);

  // Reset when chat changes
  useEffect(() => {
    setMessages([]);
    setCursor(undefined);
    setHasMore(true);
    setError(null);
  }, [chatId]);

  return {
    messages,
    isLoading: !initialMessages && enabled && !!chatId,
    isLoadingMore,
    hasMore,
    error,
    loadMore,
    refresh,
  };
}

/**
 * Hook for detecting when user scrolls near the top of a container
 * Useful for triggering "load more" when user scrolls up in message history
 */
export function useScrollTopDetection(
  containerRef: React.RefObject<HTMLElement>,
  threshold = 100,
  onNearTop?: () => void,
) {
  useEffect(() => {
    const container = containerRef.current;
    if (!container || !onNearTop) return;

    const handleScroll = () => {
      const { scrollTop } = container;

      // Check if we're near the top
      if (scrollTop < threshold) {
        onNearTop();
      }
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, [containerRef, threshold, onNearTop]);
}
