/**
 * Message list display component
 * Refactored to use sub-components for better organization
 */

import React, { useEffect, useRef } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
import { SearchProgress } from "../SearchProgress";
import { logger } from "../../lib/logger";
import { EmptyState } from "./EmptyState";
import { ScrollToBottomFab } from "./ScrollToBottomFab";
import { MessageItem } from "./MessageItem";
import { LoadMoreButton } from "../LoadMoreButton";
import {
  MessageSkeleton,
  LoadingMoreIndicator,
  LoadErrorState,
} from "./MessageSkeleton";
import { VirtualizedMessageList } from "./VirtualizedMessageList";
import { shouldFilterMessage } from "./DeprecatedDotMessage";
import type { Chat } from "../../lib/types/chat";
import type { Message } from "../../lib/types/message";
import { getMessageKey } from "../../lib/utils/messageKeys";

/**
 * Public props for `MessageList` UI component.
 * This component renders a scrollable list of chat messages with pagination,
 * error states, skeletons, and controls.
 */
interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  onToggleSidebar: () => void;
  onShare?: () => void;
  currentChat?: Chat;
  searchProgress?: {
    stage: "idle" | "searching" | "scraping" | "analyzing" | "generating";
    message?: string;
    urls?: string[];
    currentUrl?: string;
  } | null;
  onDeleteLocalMessage?: (messageId: string) => void;
  onRequestDeleteMessage?: (messageId: string) => void;
  // Pagination props
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  isLoadingMessages?: boolean;
  loadError?: Error | null;
  retryCount?: number;
  onClearError?: () => void;
  // NEW: Add streaming state for real-time updates
  streamingState?: {
    isStreaming: boolean;
    streamingContent: string;
    streamingMessageId?: Id<"messages"> | string;
    thinking?: string;
    // Real-time messages from subscription (loosely typed on purpose)
    messages?: ReadonlyArray<unknown>;
  };
  isReadOnly?: boolean;
}

/**
 * Main message list component
 */

/**
 * Render the message list for a chat conversation with pagination support.
 * Memoized to prevent unnecessary re-renders during streaming.
 */
export const MessageList = React.memo(function MessageList({
  messages,
  isGenerating,
  onToggleSidebar,
  onShare: _onShare,
  currentChat: _currentChat,
  searchProgress,
  onDeleteLocalMessage,
  onRequestDeleteMessage,
  // Pagination props
  isLoadingMore = false,
  hasMore = false,
  onLoadMore,
  isLoadingMessages = false,
  loadError,
  retryCount = 0,
  onClearError,
  // NEW: Add streaming state
  streamingState,
  isReadOnly = false,
}: MessageListProps) {
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const isLoadingMoreRef = useRef(false);
  const [collapsedById, setCollapsedById] = React.useState<
    Record<string, boolean>
  >({});
  const [userHasScrolled, setUserHasScrolled] = React.useState(false);
  const [hoveredSourceUrl, setHoveredSourceUrl] = React.useState<string | null>(
    null,
  );
  const [_hoveredCitationUrl, setHoveredCitationUrl] = React.useState<
    string | null
  >(null);

  // CRITICAL: Just use messages as-is, no enhancement
  // All message handling should happen upstream
  // Exception: Apply streaming content for active streaming messages
  const enhancedMessages = React.useMemo(() => {
    // Direct pass-through, no modification
    // All streaming enhancement is disabled to prevent duplicate sources
    // EXCEPT: Apply streaming content to the actively streaming message for tests
    if (
      streamingState?.streamingContent &&
      streamingState?.streamingMessageId
    ) {
      return messages.map((msg) => {
        if (msg._id === streamingState.streamingMessageId && msg.isStreaming) {
          return {
            ...msg,
            content: streamingState.streamingContent,
          };
        }
        return msg;
      });
    }
    return messages;
  }, [messages, streamingState]);

  // Use enhanced messages for all operations
  const currentMessages = enhancedMessages;
  const messagesLength = currentMessages.length;

  // Initialize ref with correct length on first render
  const previousMessagesLengthRef = useRef(0);
  if (previousMessagesLengthRef.current === 0 && messagesLength > 0) {
    previousMessagesLengthRef.current = messagesLength;
  }

  /**
   * Scroll to bottom of messages
   */
  const scrollToBottom = React.useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, []);

  const handleScrollToBottom = React.useCallback(() => {
    scrollToBottom();
    setUserHasScrolled(false);
  }, [scrollToBottom]);

  const handleDeleteMessage = React.useCallback(
    async (messageId: Id<"messages"> | string | undefined) => {
      if (!messageId) return;

      try {
        if (!window.confirm("Delete this message? This cannot be undone."))
          return;
        if (onRequestDeleteMessage) {
          onRequestDeleteMessage(String(messageId));
        } else if (
          String(messageId).startsWith("local_") ||
          String(messageId).startsWith("msg_")
        ) {
          onDeleteLocalMessage?.(String(messageId));
        } else {
          await deleteMessage({ messageId: messageId as Id<"messages"> });
        }
      } catch (err) {
        logger.error("Failed to delete message", err);
      }
    },
    [onRequestDeleteMessage, onDeleteLocalMessage, deleteMessage],
  );

  // Only auto-scroll if user hasn't manually scrolled up
  useEffect(() => {
    if (!userHasScrolled) {
      scrollToBottom();
    }
  }, [userHasScrolled, scrollToBottom]);

  // Debug logging - only log significant changes
  useEffect(() => {
    if (Array.isArray(currentMessages) && import.meta.env.DEV) {
      // Only log when message count actually changes
      const prevCount = previousMessagesLengthRef.current;
      if (prevCount !== currentMessages.length) {
        logger.debug("🖼️ MessageList updated", {
          prevCount,
          newCount: currentMessages.length,
          firstRole: currentMessages[0]?.role,
        });
      }
    }
  }, [currentMessages]); // Include full array dependency to satisfy React linter

  // Detect when user scrolls manually
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setUserHasScrolled(!isAtBottom);
    };

    container.addEventListener("scroll", handleScroll, { passive: true });
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  // Auto-collapse sources and reasoning appropriately
  useEffect(() => {
    setCollapsedById((prev) => {
      const updates: Record<string, boolean> = {};

      currentMessages.forEach((m, index) => {
        const id = m._id || String(index);
        if (!id || m.role !== "assistant") return;

        const hasReasoning = Boolean(m.reasoning && m.reasoning.trim());
        const hasContent = Boolean(m.content && m.content.trim());
        const isStreaming = Boolean(m.isStreaming);

        // Sources should NOT be collapsed initially - let users see search results
        // Only collapse after content has been generated
        if (m.searchResults && m.searchResults.length > 0) {
          const sourceId = id;
          if (prev[sourceId] === undefined) {
            // Don't collapse sources initially - only after content is complete
            updates[sourceId] = !isStreaming && hasContent;
          }
        }

        // Reasoning should expand while streaming, collapse when done
        if (hasReasoning) {
          const reasoningId = `reasoning-${id}`;
          // Auto-expand when streaming starts or reasoning exists without content
          // Auto-collapse when streaming ends AND content exists
          const shouldCollapse = !isStreaming && hasContent;

          // Only update if state needs to change
          if (prev[reasoningId] !== shouldCollapse) {
            updates[reasoningId] = shouldCollapse;
          }
        }
      });

      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [currentMessages]);

  /**
   * Toggle collapsed state for element
   */
  const toggleCollapsed = React.useCallback((id: string) => {
    setCollapsedById((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  // Handle load more with scroll position preservation
  const handleLoadMore = React.useCallback(async () => {
    if (!onLoadMore || isLoadingMoreRef.current) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    // Save scroll height before loading
    const prevScrollHeight = container.scrollHeight;
    const prevScrollTop = container.scrollTop;

    isLoadingMoreRef.current = true;

    try {
      await onLoadMore();

      // After messages are loaded, restore scroll position
      requestAnimationFrame(() => {
        if (container) {
          const newScrollHeight = container.scrollHeight;
          const scrollDiff = newScrollHeight - prevScrollHeight;
          container.scrollTop = prevScrollTop + scrollDiff;
        }
      });
    } finally {
      isLoadingMoreRef.current = false;
    }
  }, [onLoadMore]);

  // Track when messages change to preserve scroll on load more
  useEffect(() => {
    const prevLength = previousMessagesLengthRef.current;
    const currLength = messagesLength;

    // If messages increased and we were loading more, preserve scroll
    if (currLength > prevLength && isLoadingMoreRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        // Scroll preservation is handled in handleLoadMore
      }
    }

    previousMessagesLengthRef.current = currLength;
  }, [messagesLength]);

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto relative overscroll-contain"
    >
      <ScrollToBottomFab
        visible={userHasScrolled && messagesLength > 0}
        onClick={handleScrollToBottom}
      />

      {/* Show skeleton when initially loading messages */}
      {isLoadingMessages && messagesLength === 0 ? (
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <MessageSkeleton count={5} />
        </div>
      ) : loadError && onClearError ? (
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <LoadErrorState
            error={loadError}
            onRetry={onClearError}
            retryCount={retryCount}
          />
        </div>
      ) : messagesLength === 0 ? (
        <EmptyState onToggleSidebar={onToggleSidebar} />
      ) : (
        <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
          {/* Error state for pagination */}
          {loadError && onClearError && (
            <LoadErrorState
              error={loadError}
              onRetry={onClearError}
              retryCount={retryCount}
            />
          )}

          {/* Test hook: hidden count for E2E smoke assertions */}
          <span data-testid="count" style={{ display: "none" }}>
            {messagesLength}
          </span>

          {/* Load More Button at the top for loading older messages */}
          {/* Only show if we have 50+ messages to avoid clutter with small chats */}
          {hasMore && onLoadMore && !loadError && messagesLength >= 50 && (
            <LoadMoreButton
              onClick={handleLoadMore}
              isLoading={isLoadingMore}
              hasMore={hasMore}
            />
          )}

          {/* Loading indicator when fetching more messages */}
          {isLoadingMore && !loadError && <LoadingMoreIndicator />}

          {/* Use virtualization for large message lists (100+ messages) */}
          {messagesLength > 100 ? (
            <VirtualizedMessageList
              messages={currentMessages.filter(
                (message) => !shouldFilterMessage(message),
              )}
              className="space-y-6 sm:space-y-8"
              estimatedItemHeight={150}
              renderItem={(message, index) => (
                <MessageItem
                  key={getMessageKey(message, index)}
                  message={message}
                  index={index}
                  collapsedById={collapsedById}
                  hoveredSourceUrl={hoveredSourceUrl}
                  onToggleCollapsed={toggleCollapsed}
                  onDeleteMessage={handleDeleteMessage}
                  onSourceHover={setHoveredSourceUrl}
                  onCitationHover={setHoveredCitationUrl}
                  isReadOnly={isReadOnly}
                />
              )}
            />
          ) : (
            currentMessages
              .filter((message) => !shouldFilterMessage(message))
              .map((message, index) => {
                const messageKey = getMessageKey(message, index);
                // Safety check - key should NEVER be undefined
                const safeKey =
                  messageKey || `fallback-${index}-${Date.now().toString(36)}`;

                if (import.meta.env.DEV) {
                  // Log all keys to debug duplicates
                  logger.debug(`[KEY] Message ${index}:`, {
                    key: safeKey,
                    _id: message._id,
                    role: message.role,
                    contentStart: message.content?.substring(0, 20),
                  });

                  if (!messageKey) {
                    console.error("[KEY] WARNING: Message has no key!", {
                      message,
                      index,
                      _id: message._id,
                      generatedKey: getMessageKey(message, index),
                    });
                  }
                }

                return (
                  <MessageItem
                    key={safeKey}
                    message={message}
                    index={index}
                    collapsedById={collapsedById}
                    hoveredSourceUrl={hoveredSourceUrl}
                    onToggleCollapsed={toggleCollapsed}
                    onDeleteMessage={handleDeleteMessage}
                    onSourceHover={setHoveredSourceUrl}
                    onCitationHover={setHoveredCitationUrl}
                    isReadOnly={isReadOnly}
                  />
                );
              })
          )}

          {/* Show search progress ONLY if we don't have a streaming message showing it */}
          {isGenerating &&
            searchProgress &&
            searchProgress.stage !== "generating" &&
            searchProgress.stage !== "idle" &&
            // Only show if no streaming message exists
            !currentMessages.some(
              (msg) => msg.role === "assistant" && msg.isStreaming,
            ) && <SearchProgress progress={searchProgress} />}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
});
