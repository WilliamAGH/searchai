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
import type { Chat } from "../../lib/types/chat";
import type { Message } from "../../lib/types/message";

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
    streamingMessageId?: any; // Convex ID type - will be Id<"messages">
    thinking?: string;
  };
}

/**
 * Main message list component
 */
/**
 * Render the message list for a chat conversation with pagination support.
 */
export function MessageList({
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

  // NEW: Enhance messages with streaming content for real-time updates
  const enhancedMessages = React.useMemo(() => {
    if (!streamingState?.isStreaming || !streamingState?.streamingMessageId) {
      return messages;
    }

    return messages.map((msg) => {
      // Compare IDs properly - handle both string and Convex ID types
      const msgId = typeof msg.id === "string" ? msg.id : msg._id;
      if (msgId === streamingState.streamingMessageId) {
        return {
          ...msg,
          content: msg.content + (streamingState.streamingContent || ""),
          isStreaming: true,
          thinking: streamingState.thinking,
        };
      }
      return msg;
    });
  }, [messages, streamingState]);

  // Use enhanced messages for all operations
  const currentMessages = enhancedMessages;
  const messagesLength = currentMessages.length;

  // Initialize ref after currentMessages is available
  const previousMessagesLengthRef = useRef(currentMessages.length);

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
        } else {
          if (
            String(messageId).startsWith("local_") ||
            String(messageId).startsWith("msg_")
          ) {
            onDeleteLocalMessage?.(String(messageId));
          } else {
            await deleteMessage({ messageId: messageId as Id<"messages"> });
          }
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

  // Debug logging
  useEffect(() => {
    if (Array.isArray(currentMessages)) {
      logger.debug("🖼️ MessageList render", {
        count: currentMessages.length,
        firstRole: currentMessages[0]?.role,
      });
    }
  }, [currentMessages]);

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

        // Reasoning should expand while streaming, collapse when content starts
        if (hasReasoning) {
          const reasoningId = `reasoning-${id}`;
          if (prev[reasoningId] === undefined) {
            // Show reasoning while it's being generated, collapse when content arrives
            updates[reasoningId] = hasContent && !isStreaming;
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
          {hasMore && onLoadMore && !loadError && (
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
              messages={currentMessages}
              className="space-y-6 sm:space-y-8"
              estimatedItemHeight={150}
              renderItem={(message, index) => (
                <MessageItem
                  key={
                    message._id ||
                    `message-${index}-${message.timestamp || Date.now()}`
                  }
                  message={message}
                  index={index}
                  collapsedById={collapsedById}
                  hoveredSourceUrl={hoveredSourceUrl}
                  onToggleCollapsed={toggleCollapsed}
                  onDeleteMessage={handleDeleteMessage}
                  onSourceHover={setHoveredSourceUrl}
                  onCitationHover={setHoveredCitationUrl}
                />
              )}
            />
          ) : (
            currentMessages.map((message, index) => (
              <MessageItem
                key={
                  message._id ||
                  `message-${index}-${message.timestamp || Date.now()}`
                }
                message={message}
                index={index}
                collapsedById={collapsedById}
                hoveredSourceUrl={hoveredSourceUrl}
                onToggleCollapsed={toggleCollapsed}
                onDeleteMessage={handleDeleteMessage}
                onSourceHover={setHoveredSourceUrl}
                onCitationHover={setHoveredCitationUrl}
              />
            ))
          )}

          {/* Show "AI is thinking" when in generating stage */}
          {isGenerating &&
            searchProgress &&
            searchProgress.stage === "generating" && (
              <div className="flex gap-2 sm:gap-4">
                <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                  <svg
                    className="w-4 h-4 text-white"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
                    />
                  </svg>
                </div>
                <div className="flex-1">
                  <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                    <svg
                      className="w-4 h-4 animate-spin"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                      aria-hidden="true"
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
                      />
                    </svg>
                    <span>AI is thinking and generating response...</span>
                    <div className="flex space-x-1">
                      <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0ms]"></div>
                      <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:100ms]"></div>
                      <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:200ms]"></div>
                    </div>
                  </div>
                </div>
              </div>
            )}

          {/* Show search progress for non-generating stages */}
          {isGenerating &&
            searchProgress &&
            searchProgress.stage !== "generating" && (
              <SearchProgress progress={searchProgress} />
            )}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
