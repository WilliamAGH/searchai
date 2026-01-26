/**
 * Message list display component
 * Refactored to use sub-components for better organization
 */

import React, { useEffect, useCallback, useState } from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { useMutation } from "convex/react";
import { api } from "../../../convex/_generated/api";
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
import type { Message } from "../../lib/types/message";
import { useMessageListScroll } from "../../hooks/useMessageListScroll";
import { resolveMessageKey } from "./messageKey";
import { ReasoningDisplay } from "./ReasoningDisplay";

/** Virtualize message list when exceeding this count for performance */
const VIRTUALIZATION_THRESHOLD = 100;

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  onToggleSidebar: () => void;
  searchProgress?: {
    stage:
      | "idle"
      | "planning"
      | "searching"
      | "scraping"
      | "analyzing"
      | "generating";
    message?: string;
    urls?: string[];
    currentUrl?: string;
    queries?: string[];
    /** LLM's schema-enforced reasoning for this tool call */
    toolReasoning?: string;
    /** Search query being executed */
    toolQuery?: string;
    /** URL being scraped */
    toolUrl?: string;
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
  // Session ID for authorization (anonymous users)
  sessionId?: string;
  // Optional external scroll container ref (when parent handles scrolling)
  scrollContainerRef?: React.RefObject<HTMLDivElement>;
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
  sessionId,
  scrollContainerRef: externalScrollRef,
}: MessageListProps) {
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const internalScrollRef = useRef<HTMLDivElement>(null);
  // Use external scroll container if provided, otherwise use internal
  const scrollContainerRef = externalScrollRef || internalScrollRef;
  const useExternalScroll = !!externalScrollRef;
  const previousMessagesLengthRef = useRef(messages.length);
  const isLoadingMoreRef = useRef(false);
  const lastSeenMessageCountRef = useRef(messages.length);
  const autoScrollEnabledRef = useRef(true);
  const isTouchingRef = useRef(false);
  const smoothScrollInProgressRef = useRef(false);

  const isMobile = useIsMobile();
  const isVirtualKeyboardOpen = useIsVirtualKeyboardOpen();
  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>(
    {},
  );
  const [userHasScrolled, setUserHasScrolled] = useState(false);
  const [unseenMessageCount, setUnseenMessageCount] = useState(0);
  const [hoveredSourceUrl, setHoveredSourceUrl] = useState<string | null>(null);
  // Citation hover callback - currently unused but passed to children for future highlight sync
  const handleCitationHover = useCallback((_url: string | null) => {
    // No-op: citation hover state not currently consumed
  }, []);

  // Dynamic thresholds based on viewport
  const NEAR_BOTTOM_THRESHOLD = isMobile ? 100 : 200;
  const STUCK_THRESHOLD = isMobile ? 50 : 100;
  // Percentage threshold: hide FAB when user is 95%+ of the way down
  const SCROLL_PERCENT_THRESHOLD = 95;

  /**
   * Cancel any ongoing smooth scroll
   */
  const cancelSmoothScroll = useCallback(() => {
    const container = scrollContainerRef.current;
    if (container && smoothScrollInProgressRef.current) {
      const currentPos = container.scrollTop;
      container.scrollTo({ top: currentPos, behavior: "instant" });
      smoothScrollInProgressRef.current = false;
    }
  }, [scrollContainerRef]);

  /**
   * Scroll to bottom of messages
   */
  const scrollToBottom = useCallback(
    (behavior: ScrollBehavior = "smooth") => {
      const container = scrollContainerRef.current;
      if (!container) return;

      if (behavior === "smooth") {
        smoothScrollInProgressRef.current = true;
        messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
        // Reset flag after animation completes (~500ms) and ensure FAB is hidden
        setTimeout(() => {
          smoothScrollInProgressRef.current = false;
          // After scroll animation, verify we're near bottom and keep FAB hidden
          const stillNearBottom =
            isNearBottom(container, STUCK_THRESHOLD) ||
            isScrolledPastPercent(container, SCROLL_PERCENT_THRESHOLD);
          if (stillNearBottom) {
            setUserHasScrolled(false);
          }
        }, SCROLL_ANIMATION_MS);
      } else {
        messagesEndRef.current?.scrollIntoView({ behavior: "instant" });
      }
    },
    [scrollContainerRef, STUCK_THRESHOLD, SCROLL_PERCENT_THRESHOLD],
  );

  const handleScrollToBottom = useCallback(() => {
    scrollToBottom("smooth");
    setUserHasScrolled(false);
    setUnseenMessageCount(0);
    autoScrollEnabledRef.current = true;
    lastSeenMessageCountRef.current = messages.length;
  }, [scrollToBottom, messages.length]);

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
            await deleteMessage({
              messageId: messageId as Id<"messages">,
              sessionId,
            });
          }
        }
      } catch (err) {
        logger.error("Failed to delete message", err);
      }
    },
    [onRequestDeleteMessage, onDeleteLocalMessage, deleteMessage, sessionId],
  );

  // Intelligent auto-scroll: scroll when near bottom or actively generating
  // Also triggers on searchProgress changes to keep tool status visible
  // IMPORTANT: Pauses when virtual keyboard is open to prevent viewport theft
  // on mobile during input composition (see useIsVirtualKeyboardOpen)
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    // On mobile, the virtual keyboard hook detects when the keyboard is open
    // and pauses auto-scroll to prevent layout shifts during typing.
    // On desktop, focus alone shouldn't disable auto-scroll since there's no
    // viewport shift - only the virtual keyboard causes that issue.
    const shouldAutoScroll =
      autoScrollEnabledRef.current &&
      !isVirtualKeyboardOpen &&
      (isNearBottom(container, NEAR_BOTTOM_THRESHOLD) ||
        (isGenerating && !userHasScrolled));

    if (shouldAutoScroll) {
      scrollToBottom("smooth");
      lastSeenMessageCountRef.current = messages.length;
    }
  }, [
    messages,
    isGenerating,
    userHasScrolled,
    isVirtualKeyboardOpen,
    scrollToBottom,
    NEAR_BOTTOM_THRESHOLD,
    scrollContainerRef,
    searchProgress, // Include to scroll when tool progress updates
  ]);

  // Debug logging
  useEffect(() => {
    if (Array.isArray(messages)) {
      logger.debug("🖼️ MessageList render", {
        count: messages.length,
        firstRole: messages[0]?.role,
      });
    }
  }, [messages]);

  // Track unseen messages when user is scrolled up
  useEffect(() => {
    if (userHasScrolled) {
      const newMessages = messages.length - lastSeenMessageCountRef.current;
      if (newMessages > 0) {
        setUnseenMessageCount(newMessages);
      }
    }
  }, [messages.length, userHasScrolled]);

  // Reset auto-scroll when new assistant message starts streaming
  useEffect(() => {
    const lastMessage = messages[messages.length - 1];
    if (
      lastMessage?.role === "assistant" &&
      lastMessage?.isStreaming &&
      isGenerating
    ) {
      // Re-enable auto-scroll for new responses if near bottom
      const container = scrollContainerRef.current;
      if (container && isNearBottom(container, NEAR_BOTTOM_THRESHOLD * 2)) {
        autoScrollEnabledRef.current = true;
        setUserHasScrolled(false);
      }
    }
  }, [messages, isGenerating, NEAR_BOTTOM_THRESHOLD, scrollContainerRef]);

  // Detect when user scrolls manually with touch/scroll awareness
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleTouchStart = () => {
      isTouchingRef.current = true;
      cancelSmoothScroll();
    };

    const handleTouchEnd = () => {
      isTouchingRef.current = false;
    };

    const handleWheel = () => {
      cancelSmoothScroll();
    };

    const handleScroll = throttle(() => {
      // If smooth scroll is in progress, don't update state
      if (smoothScrollInProgressRef.current) return;

      // Use both pixel threshold AND percentage-based check for reliability
      // This ensures FAB hides at ~95% scroll even on very tall content
      const nearBottomPixels = isNearBottom(container, STUCK_THRESHOLD);
      const nearBottomPercent = isScrolledPastPercent(
        container,
        SCROLL_PERCENT_THRESHOLD,
      );
      const nearBottom = nearBottomPixels || nearBottomPercent;
      const wasScrolledUp = userHasScrolled;

      // User is near bottom - enable auto-scroll
      if (nearBottom) {
        if (wasScrolledUp) {
          setUserHasScrolled(false);
          setUnseenMessageCount(0);
          lastSeenMessageCountRef.current = messages.length;
        }
        autoScrollEnabledRef.current = true;
      }
      // User scrolled up - disable auto-scroll
      else {
        if (!wasScrolledUp) {
          setUserHasScrolled(true);
          lastSeenMessageCountRef.current = messages.length;
        }
        autoScrollEnabledRef.current = false;
      }
    }, THROTTLE_MS);

    container.addEventListener("scroll", handleScroll, { passive: true });
    container.addEventListener("touchstart", handleTouchStart, {
      passive: true,
    });
    container.addEventListener("touchend", handleTouchEnd, { passive: true });
    container.addEventListener("wheel", handleWheel, { passive: true });

    return () => {
      container.removeEventListener("scroll", handleScroll);
      container.removeEventListener("touchstart", handleTouchStart);
      container.removeEventListener("touchend", handleTouchEnd);
      container.removeEventListener("wheel", handleWheel);
    };
  }, [
    userHasScrolled,
    messages.length,
    STUCK_THRESHOLD,
    cancelSmoothScroll,
    scrollContainerRef,
  ]);

  // Auto-collapse sources and reasoning appropriately
  useEffect(() => {
    setCollapsedById((prev) => {
      const updates: Record<string, boolean> = {};

      messages.forEach((m, index) => {
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
  }, [messages]);

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
  }, [onLoadMore, scrollContainerRef]);

  // Track when messages change to preserve scroll on load more
  useEffect(() => {
    const prevLength = previousMessagesLengthRef.current;
    const currLength = messages.length;

    // If messages increased and we were loading more, preserve scroll
    if (currLength > prevLength && isLoadingMoreRef.current) {
      const container = scrollContainerRef.current;
      if (container) {
        // Scroll preservation is handled in handleLoadMore
      }
    }

    previousMessagesLengthRef.current = currLength;
  }, [messages.length, scrollContainerRef]);

  // Content to render (shared between internal and external scroll modes)
  const content = (
    <>
      <ScrollToBottomFab
        visible={userHasScrolled && messages.length > 0}
        onClick={handleScrollToBottom}
        unseenCount={unseenMessageCount}
      />

      {/* Show skeleton when initially loading messages */}
      {isLoadingMessages && messages.length === 0 ? (
        <div className="px-4 sm:px-6 py-6 sm:py-8">
          <MessageSkeleton count={5} />
        </div>
      ) : messages.length === 0 ? (
        <EmptyState onToggleSidebar={onToggleSidebar} />
      ) : (
        <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8 min-w-0">
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
            {messages.length}
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

          {/* Use virtualization for large message lists */}
          {messages.length > VIRTUALIZATION_THRESHOLD ? (
            <VirtualizedMessageList
              messages={messages}
              className="space-y-6 sm:space-y-8"
              estimatedItemHeight={150}
              renderItem={(message, index) => {
                const messageKey = resolveMessageKey(
                  message,
                  `virtual-${index}`,
                );
                return (
                  <MessageItem
                    key={messageKey}
                    message={message}
                    index={index}
                    collapsedById={collapsedById}
                    hoveredSourceUrl={hoveredSourceUrl}
                    onToggleCollapsed={toggleCollapsed}
                    onDeleteMessage={handleDeleteMessage}
                    onSourceHover={setHoveredSourceUrl}
                    onCitationHover={handleCitationHover}
                    searchProgress={
                      index === messages.length - 1 && isGenerating
                        ? searchProgress
                        : undefined
                    }
                  />
                );
              }}
            />
          ) : (
            messages.map((message, index) => {
              // Generate stable unique key for each message
              const messageKey = resolveMessageKey(message, `linear-${index}`);

              // Debug undefined keys in development
              if (!message._id && import.meta.env.DEV) {
                console.warn("Message missing _id:", {
                  index,
                  role: message.role,
                  content: message.content?.substring(0, 50),
                });
              }

              return (
                <MessageItem
                  key={messageKey}
                  message={message}
                  index={index}
                  collapsedById={collapsedById}
                  hoveredSourceUrl={hoveredSourceUrl}
                  onToggleCollapsed={toggleCollapsed}
                  onDeleteMessage={handleDeleteMessage}
                  onSourceHover={setHoveredSourceUrl}
                  onCitationHover={handleCitationHover}
                  searchProgress={
                    index === messages.length - 1 && isGenerating
                      ? searchProgress
                      : undefined
                  }
                />
              );
            })
          )}

          {/* Show reasoning/thinking while AI is planning or thinking */}
          {isGenerating &&
            messages.length > 0 &&
            (() => {
              const lastMessage = messages[messages.length - 1];
              return (
                lastMessage?.role === "assistant" &&
                lastMessage?.reasoning && (
                  <ReasoningDisplay reasoning={lastMessage.reasoning} />
                )
              );
            })()}

          {/* Search progress and generation status now shown inline within MessageItem */}
        </div>
      )}
      <div ref={messagesEndRef} />
    </>
  );

  // When using external scroll container, just render the content directly
  // The parent handles the scroll container
  // Use grow shrink-0 (not flex-1): grow to fill space when content is small,
  // don't shrink when content is large (allows scroll overflow)
  if (useExternalScroll) {
    return (
      <div className="grow shrink-0 flex flex-col relative">{content}</div>
    );
  }

  // Internal scroll container (fallback for backwards compatibility)
  return (
    <div
      ref={internalScrollRef}
      className="flex-1 overflow-y-auto relative overscroll-contain"
    >
      {content}
    </div>
  );
}
