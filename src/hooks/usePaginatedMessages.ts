import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { useQuery, useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message } from "@/lib/types/message";
import { logger } from "@/lib/logger";
import {
  computeBackoffDelay,
  mapPaginatedMessage,
  mergeInitialPageWithLoadedMessages,
  prependOlderMessages,
} from "@/hooks/utils/paginatedMessages";
import { toConvexId } from "@/lib/utils/idValidation";

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
  const normalizedChatKeysRef = useRef(new Set<string>());
  const sessionRef = useRef(0);
  const resolvedChatId = toConvexId<"chats">(chatId);

  const loadMoreAction = useAction<typeof api.chats.loadMore.loadMoreMessages>(
    api.chats.loadMore.loadMoreMessages,
  );
  const normalizeChatSchema = useMutation<
    typeof api.chats.normalizeChatMessagesSchema
  >(api.chats.normalizeChatMessagesSchema);

  const initialMessages = useQuery<
    typeof api.chats.messagesPaginated.getChatMessagesPaginated
  >(
    api.chats.messagesPaginated.getChatMessagesPaginated,
    enabled && resolvedChatId
      ? {
          chatId: resolvedChatId,
          limit: initialLimit,
          sessionId: sessionId || undefined,
        }
      : "skip",
  );

  const initialLoadStartRef = useRef<number | null>(null);

  useEffect(() => {
    if (enabled && chatId && !initialLoadStartRef.current) {
      initialLoadStartRef.current = performance.now();
    }
  }, [enabled, chatId]);

  const initialUIMessages = useMemo<Message[]>(() => {
    if (!initialMessages) return [];
    const convexMessages = initialMessages.messages || [];
    return convexMessages.map((msg) => mapPaginatedMessage(msg, chatId));
  }, [initialMessages, chatId]);

  useEffect(() => {
    if (!enabled || !resolvedChatId) {
      return;
    }

    const sessionKey = sessionId || "no-session";
    const normalizationKey = `${resolvedChatId}:${sessionKey}`;
    if (normalizedChatKeysRef.current.has(normalizationKey)) {
      return;
    }

    normalizedChatKeysRef.current.add(normalizationKey);
    void normalizeChatSchema({
      chatId: resolvedChatId,
      sessionId: sessionId || undefined,
    })
      .then((result) => {
        logger.info("Normalized chat history to current schema", {
          chatId,
          normalized: result.normalized,
          processed: result.processed,
        });
      })
      .catch((normalizationError: unknown) => {
        normalizedChatKeysRef.current.delete(normalizationKey);
        const surfacedError =
          normalizationError instanceof Error
            ? normalizationError
            : new Error(String(normalizationError));
        logger.error("Failed to normalize chat history schema", {
          chatId,
          error: surfacedError.message,
        });
        setError(surfacedError);
      });
  }, [chatId, enabled, normalizeChatSchema, resolvedChatId, sessionId]);

  useEffect(() => {
    if (initialMessages) {
      const unifiedMessages = initialUIMessages;

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

      setMessages((prev) => {
        const hasOptimisticMessages = prev.some(
          (m) => m.isStreaming === true || m.persisted === false,
        );

        if (hasOptimisticMessages) {
          logger.debug(
            "Skipping initial messages load - preserving optimistic state",
            {
              chatId,
              optimisticCount: prev.length,
              dbCount: unifiedMessages.length,
            },
          );
          return prev;
        }

        return mergeInitialPageWithLoadedMessages(prev, unifiedMessages);
      });
      setCursor(initialMessages.nextCursor ?? null);
      setHasMore(initialMessages.hasMore);
      setError(null);
    }
  }, [initialMessages, chatId, initialUIMessages]);

  const loadMore = useCallback(async () => {
    if (!resolvedChatId || !cursor || !hasMore || loadingRef.current) return;

    loadingRef.current = true;
    setIsLoadingMore(true);
    setError(null);

    const currentSession = sessionRef.current;
    const loadStartTime = performance.now();

    let didSucceed = false;

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
            mapPaginatedMessage(msg, chatId),
          );

          if (sessionRef.current !== currentSession) {
            logger.info(
              "Discarding stale loadMore results due to session change",
            );
            return;
          }
          setMessages((prev) => prependOlderMessages(prev, mappedMessages));
          setCursor(moreMessages.nextCursor ?? null);
          setHasMore(moreMessages.hasMore);
          setRetryCount(0);
          didSucceed = true;
        }
      } catch (err) {
        const errorMessage =
          err instanceof Error
            ? err.message
            : typeof err === "string"
              ? err
              : "Unknown error";
        const error = err instanceof Error ? err : new Error(errorMessage);
        const failTime = performance.now() - attemptStartTime;

        logger.error(`Failed to load more messages (attempt ${attempt})`, {
          error: error.message,
          chatId,
          attempt,
          failTime: Math.round(failTime),
        });

        const maxRetries = 3;
        if (attempt < maxRetries) {
          const delay = computeBackoffDelay(attempt);
          logger.info(`Retrying in ${delay}ms...`, {
            chatId,
            nextAttempt: attempt + 1,
            delay,
          });

          setRetryCount(attempt);

          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
          }

          retryTimeoutRef.current = setTimeout(() => {
            if (sessionRef.current !== currentSession) return;
            void attemptLoad(attempt + 1);
          }, delay);
        } else {
          const totalTime = performance.now() - loadStartTime;
          logger.error("All pagination retries exhausted", {
            chatId,
            totalAttempts: attempt,
            totalTime: Math.round(totalTime),
            error: error.message,
          });

          setError(error);
          setRetryCount(0);
        }
      }
    };

    try {
      await attemptLoad();
    } finally {
      const totalTime = performance.now() - loadStartTime;
      logger.info("Pagination operation completed", {
        chatId,
        totalTime: Math.round(totalTime),
        success: didSucceed,
      });

      setIsLoadingMore(false);
      loadingRef.current = false;
    }
  }, [
    chatId,
    cursor,
    hasMore,
    initialLimit,
    loadMoreAction,
    sessionId,
    resolvedChatId,
  ]);

  const refresh = useCallback(async () => {
    if (!chatId) return;

    setCursor(null);
    setHasMore(false);
    setMessages([]);
    setError(null);
  }, [chatId]);

  const clearError = useCallback(() => {
    setError(null);
    setRetryCount(0);
  }, []);

  useEffect(() => {
    sessionRef.current++;
    setMessages([]);
    setCursor(null);
    setHasMore(false);
    setError(null);
    setRetryCount(0);

    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
    }
  }, [chatId]);

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
