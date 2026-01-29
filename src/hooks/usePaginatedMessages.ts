/**
 * Hook for loading messages with pagination support
 * Provides efficient message loading with cursor-based pagination
 */

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useAction } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message } from "@/lib/types/message";
import { logger } from "@/lib/logger";
import { toConvexId } from "@/lib/utils/idValidation";

/** Map a Convex message to the local Message type */
function mapConvexMessage(msg: Message, fallbackChatId: string | null): Message {
  return {
    ...msg,
    _id: String(msg._id),
    chatId: String(msg.chatId ?? fallbackChatId ?? ""),
    _creationTime: msg._creationTime ?? msg.timestamp ?? Date.now(),
    timestamp: msg.timestamp ?? msg._creationTime ?? Date.now(),
    content: msg.content ?? "",
  };
}

/** Compute exponential backoff delay (ms) capped at 5s */
function computeBackoffDelay(attempt: number): number {
  const base = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(1000 * base, 5000);
}

interface UsePaginatedMessagesOptions {
  chatId: string | null;
  initialLimit?: number;
  enabled?: boolean;
  sessionId?: string;
}

interface PaginatedMessagesState {
  messages: Message[];
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
  sessionId,
}: UsePaginatedMessagesOptions): PaginatedMessagesState {
  const [messages, setMessages] = useState<Message[]>([]);
  const [cursor, setCursor] = useState<Id<"messages"> | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [retryCount, setRetryCount] = useState(0);
  const loadingRef = useRef(false);
  const retryTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Session guard to avoid applying stale results after chat/navigation changes
  const sessionRef = useRef(0);
  const resolvedChatId = toConvexId<"chats">(chatId);

  // Get the load more action
  const loadMoreAction = useAction<typeof api.chats.loadMore.loadMoreMessages>(
    api.chats.loadMore.loadMoreMessages,
  );

  // Query for initial messages
  const initialMessages = useQuery<typeof api.chats.messagesPaginated.getChatMessagesPaginated>(
    api.chats.messagesPaginated.getChatMessagesPaginated,
    enabled && resolvedChatId
      ? {
          chatId: resolvedChatId,
          limit: initialLimit,
          sessionId: sessionId || undefined,
        }
      : "skip",
  );

  // Track initial load time
  const initialLoadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (enabled && chatId && !initialLoadStartRef.current) {
      initialLoadStartRef.current = performance.now();
    }
  }, [enabled, chatId]);

  // Pre-map initial messages for immediate render to avoid UI flicker in tests/SSR
  const initialUIMessages = useMemo<Message[]>(() => {
    if (!initialMessages) return [];
    const convexMessages = initialMessages.messages || [];
    return convexMessages.map((msg) => mapConvexMessage(msg, chatId));
  }, [initialMessages, chatId]);

  // Load initial messages when they arrive (stateful for subsequent appends)
  useEffect(() => {
    if (initialMessages) {
      const unifiedMessages = initialUIMessages;

      // Log initial load performance
      if (initialLoadStartRef.current) {
        const loadTime = performance.now() - initialLoadStartRef.current;
        logger.info("Initial messages loaded", {
          chatId,
          messagesLoaded: unifiedMessages.length,
          loadTime: Math.round(loadTime),
          hasMore: initialMessages.hasMore,
        });
        initialLoadStartRef.current = null;
      }

      // CRITICAL FIX: Don't replace messages if we have optimistic state
      // Check if we currently have messages with isStreaming=true or persisted=false
      // These are optimistic messages that shouldn't be replaced by DB fetch
      setMessages((prev) => {
        const hasOptimisticMessages = prev.some(
          (m) => m.isStreaming === true || m.persisted === false,
        );

        if (hasOptimisticMessages) {
          logger.debug("Skipping initial messages load - preserving optimistic state", {
            chatId,
            optimisticCount: prev.length,
            dbCount: unifiedMessages.length,
          });
          return prev; // Keep optimistic state
        }

        // No optimistic state - safe to load from DB
        return unifiedMessages;
      });
      setCursor(initialMessages.nextCursor ?? null);
      setHasMore(initialMessages.hasMore);
      setError(null);
    }
  }, [initialMessages, chatId, initialUIMessages]);

  // Load more messages with retry logic
  const loadMore = useCallback(async () => {
    if (!resolvedChatId || !cursor || !hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    const currentSession = sessionRef.current;
    const loadStartTime = performance.now();

    const attemptLoad = async (attempt = 1): Promise<void> => {
      const attemptStartTime = performance.now();

      try {
        logger.debug("Loading more messages", { chatId, cursor, attempt });

        const moreMessages = await loadMoreAction({
          chatId: resolvedChatId,
          cursor,
          limit: initialLimit,
          sessionId: sessionId || undefined,
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
          const mappedMessages = moreMessages.messages.map((msg: Message) =>
            mapConvexMessage(msg, chatId),
          );

          // Stale-guard: if session changed during async call, ignore results
          if (sessionRef.current !== currentSession) {
            logger.info("Discarding stale loadMore results due to session change");
            return;
          }
          setMessages((prev) => [...prev, ...mappedMessages]);
          setCursor(moreMessages.nextCursor ?? null);
          setHasMore(moreMessages.hasMore);
          setRetryCount(0); // Reset retry count on success
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error ? err.message : typeof err === "string" ? err : "Unknown error";
        const error = err instanceof Error ? err : new Error(errorMessage);
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
            void attemptLoad(attempt + 1);
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
        }
      }
    };

    await attemptLoad();

    if (!error) {
      const totalTime = performance.now() - loadStartTime;
      logger.info("Pagination operation completed", {
        chatId,
        totalTime: Math.round(totalTime),
        success: true,
      });

      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [chatId, cursor, hasMore, initialLimit, loadMoreAction, error, sessionId, resolvedChatId]);

  // Refresh messages (reload from beginning)
  const refresh = useCallback(async () => {
    if (!chatId) return;

    setCursor(null);
    setHasMore(false);
    setMessages([]);
    setError(null);

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
    setCursor(null);
    setHasMore(false);
    setError(null);
    setRetryCount(0);

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

  return {
    messages: messages.length > 0 ? messages : initialUIMessages,
    isLoading: !initialMessages && enabled && !!chatId,
    isLoadingMore,
    hasMore,
    error,
    retryCount,
    loadMore,
    refresh,
    clearError,
  };
}
