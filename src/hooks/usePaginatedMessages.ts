/**
 * Hook for loading messages with pagination support
 * Provides efficient message loading with cursor-based pagination
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { UnifiedMessage } from "../lib/types/unified";
import type { SearchResult } from "../lib/types/message";
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
  retryCount: number;
  loadMore: () => Promise<void>;
  refresh: () => Promise<void>;
  clearError: () => void;
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
  const [cursor, setCursor] = useState<Id<"messages"> | undefined>();
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const [hasLoadedInitial, setHasLoadedInitial] = useState(false);
  const loadingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout>();
  // Session guard to avoid applying stale results after chat/navigation changes
  const sessionRef = useRef(0);

  // Get the load more action
  const loadMoreAction = useAction(api.chats.loadMore.loadMoreMessages);

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

  // Track initial load time
  const initialLoadStartRef = useRef<number>();

  useEffect(() => {
    if (enabled && chatId && !initialLoadStartRef.current) {
      initialLoadStartRef.current = performance.now();
    }
  }, [enabled, chatId]);

  // Pre-map initial messages for immediate render to avoid UI flicker in tests/SSR
  // Use a stable reference by checking content equality, not reference equality
  const initialMessagesRef = useRef<typeof initialMessages>();
  const initialUnifiedMessagesRef = useRef<UnifiedMessage[]>([]);

  // Only update if content actually changed
  const initialUnifiedMessages = useMemo<UnifiedMessage[]>(() => {
    if (!initialMessages) return initialUnifiedMessagesRef.current;

    // Check if the actual message content changed
    const hasChanged =
      initialMessagesRef.current?.messages?.length !==
        initialMessages.messages?.length ||
      initialMessagesRef.current?.nextCursor !== initialMessages.nextCursor;

    if (!hasChanged && initialUnifiedMessagesRef.current.length > 0) {
      return initialUnifiedMessagesRef.current;
    }

    initialMessagesRef.current = initialMessages;
    const convexMessages = initialMessages.messages || [];
    const unified = convexMessages.map((msg, index) => {
      // Ensure we always have an ID, even for legacy messages
      const messageId = msg._id || `legacy-${chatId}-${index}-${Date.now()}`;
      return {
        _id: messageId, // Preserve _id for delete functionality
        id: messageId,
        chatId:
          chatId ??
          String((msg as unknown as { chatId?: string }).chatId ?? ""),
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
      };
    });

    initialUnifiedMessagesRef.current = unified;
    return unified;
  }, [initialMessages, chatId]);

  // Load initial messages when they arrive (stateful for subsequent appends)
  useEffect(() => {
    if (initialMessages && !hasLoadedInitial) {
      // Log initial load performance
      if (initialLoadStartRef.current) {
        const loadTime = performance.now() - initialLoadStartRef.current;
        logger.info("Initial messages loaded", {
          chatId,
          messagesLoaded: initialUnifiedMessages.length,
          loadTime: Math.round(loadTime),
          hasMore: initialMessages.hasMore,
        });
        initialLoadStartRef.current = undefined;
      }

      setMessages(initialUnifiedMessages);
      setCursor(initialMessages.nextCursor);
      setHasMore(initialMessages.hasMore);
      setError(null);
      setHasLoadedInitial(true);
    }
  }, [initialMessages, chatId, initialUnifiedMessages, hasLoadedInitial]);

  // Load more messages with retry logic
  const loadMore = useCallback(async () => {
    if (!chatId || !cursor || !hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    const currentSession = sessionRef.current;
    const loadStartTime = performance.now();
    let hasError = false;

    const attemptLoad = async (attempt = 1): Promise<void> => {
      const attemptStartTime = performance.now();

      try {
        logger.debug("Loading more messages", { chatId, cursor, attempt });

        const moreMessages = await loadMoreAction({
          chatId: chatId as Id<"chats">,
          cursor,
          limit: initialLimit,
        });

        // Track performance metrics
        const loadTime = performance.now() - attemptStartTime;
        logger.info("Pagination load completed", {
          chatId,
          loadTime: Math.round(loadTime),
          messagesLoaded: moreMessages?.messages?.length || 0,
          attempt,
          hasMore: moreMessages?.hasMore,
        });

        if (moreMessages) {
          const newUnifiedMessages: UnifiedMessage[] =
            moreMessages.messages.map((msg, index) => {
              // Ensure we always have an ID, even for legacy messages
              const messageId =
                msg._id || `legacy-more-${chatId}-${index}-${Date.now()}`;
              return {
                _id: messageId, // Preserve _id for delete functionality
                id: messageId,
                chatId: chatId,
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
              };
            });

          // Stale-guard: if session changed during async call, ignore results
          if (sessionRef.current !== currentSession) {
            logger.info(
              "Discarding stale loadMore results due to session change",
            );
            return;
          }
          setMessages((prev) => [...prev, ...newUnifiedMessages]);
          setCursor(moreMessages.nextCursor);
          setHasMore(moreMessages.hasMore);
          setRetryCount(0); // Reset retry count on success
        }
      } catch (err) {
        const error = err as Error;
        const failTime = performance.now() - attemptStartTime;

        logger.error(`Failed to load more messages (attempt ${attempt})`, {
          error: error.message,
          chatId,
          attempt,
          failTime: Math.round(failTime),
        });

        // Retry logic with exponential backoff
        const maxRetries = 3;
        if (attempt < maxRetries) {
          const delay = computeBackoffDelay(attempt);
          logger.info(`Retrying in ${delay}ms...`, {
            chatId,
            nextAttempt: attempt + 1,
            delay,
          });

          setRetryCount(attempt);

          // Clear any existing timeout
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            // If session changed while waiting, do not retry
            if (sessionRef.current !== currentSession) return;
            attemptLoad(attempt + 1);
          }, delay);
        } else {
          // Max retries reached
          const totalTime = performance.now() - loadStartTime;
          logger.error("All pagination retries exhausted", {
            chatId,
            totalAttempts: attempt,
            totalTime: Math.round(totalTime),
            error: error.message,
          });

          setError(error);
          setRetryCount(0);
          setIsLoadingMore(false);
          loadingRef.current = false;
          hasError = true;
        }
      }
    };

    await attemptLoad();

    if (!hasError) {
      const totalTime = performance.now() - loadStartTime;
      logger.info("Pagination operation completed", {
        chatId,
        totalTime: Math.round(totalTime),
        success: true,
      });

      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [chatId, cursor, hasMore, initialLimit, loadMoreAction]);

  // Refresh messages (reload from beginning)
  const refresh = useCallback(async () => {
    if (!chatId) return;

    setCursor(undefined);
    setHasMore(false);
    setMessages([]);
    setError(null);
    setHasLoadedInitial(false);

    // The query will automatically re-run
  }, [chatId]);

  // Clear error manually
  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  // Reset when chat changes
  useEffect(() => {
    // Bump session to invalidate any in-flight async operations
    sessionRef.current++;
    setMessages([]);
    setCursor(undefined);
    setHasMore(false);
    setError(null);
    setRetryCount(0);
    setHasLoadedInitial(false);

    // Clear any pending retry timeouts
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
  }, [chatId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
      }
    };
  }, []);

  // Return stable messages - use stateful messages once loaded, otherwise initial
  const effectiveMessages = hasLoadedInitial
    ? messages
    : initialUnifiedMessages;

  // CRITICAL: Only show "Load More" if we have messages AND backend says there are more
  // This prevents infinite loops on empty chats
  const effectiveHasMore =
    initialMessages && effectiveMessages.length > 0
      ? initialMessages.hasMore
      : false;

  return {
    messages: effectiveMessages,
    isLoading: !initialMessages && enabled && !!chatId,
    isLoadingMore,
    hasMore: effectiveHasMore,
    error,
    retryCount,
    loadMore,
    refresh,
    clearError,
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
/**
 * Compute exponential backoff delay (ms) capped at 5s.
 * attempt=1 => 1000ms, 2 => 2000ms, 3 => 4000ms, >=4 => 5000ms
 */
export function computeBackoffDelay(attempt: number): number {
  const base = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(1000 * base, 5000);
}

/**
 * Map Convex message documents to unified message shape for UI.
 * Performs minimal coercion and preserves optional fields.
 */
export function mapConvexMessagesToUnified(
  chatId: string | null,
  docs: Array<{
    _id: string;
    role: "user" | "assistant" | "system";
    content?: string;
    timestamp?: number;
    isStreaming?: boolean;
    streamedContent?: string;
    thinking?: string;
    searchResults?: unknown;
    sources?: unknown;
    reasoning?: string;
  }>,
) {
  const toSearchResults = (value: unknown): SearchResult[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const items: SearchResult[] = [];
    for (const v of value) {
      if (
        v &&
        typeof v === "object" &&
        typeof (v as { title?: unknown }).title === "string" &&
        typeof (v as { url?: unknown }).url === "string" &&
        typeof (v as { snippet?: unknown }).snippet === "string" &&
        typeof (v as { relevanceScore?: unknown }).relevanceScore === "number"
      ) {
        items.push(v as SearchResult);
      }
    }
    return items.length ? items : undefined;
  };

  const toSources = (value: unknown): string[] | undefined => {
    if (!Array.isArray(value)) return undefined;
    const items = value.filter((x): x is string => typeof x === "string");
    return items.length ? items : undefined;
  };

  return docs.map((msg) => ({
    id: msg._id,
    chatId: chatId ?? "",
    role: msg.role,
    content: msg.content || "",
    timestamp: msg.timestamp || Date.now(),
    isStreaming: msg.isStreaming,
    streamedContent: msg.streamedContent,
    thinking: msg.thinking,
    searchResults: toSearchResults(msg.searchResults),
    sources: toSources(msg.sources),
    reasoning: msg.reasoning,
    synced: true as const,
    source: "convex" as const,
  }));
}
