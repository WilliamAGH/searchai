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

  // Use the scroll behavior hook
  const {
    scrollContainerRef: _scrollContainerRef,
    messagesEndRef,
    internalScrollRef,
    useExternalScroll,
    userHasScrolled,
    unseenMessageCount,
    handleScrollToBottom,
    handleLoadMore: hookHandleLoadMore,
  } = useMessageListScroll({
    messageCount: messages.length,
    isGenerating,
    externalScrollRef,
    searchProgress,
  });

  const [collapsedById, setCollapsedById] = useState<Record<string, boolean>>(
    {},
  );
  const [hoveredSourceUrl, setHoveredSourceUrl] = useState<string | null>(null);
  // Citation hover callback - currently unused but passed to children for future highlight sync
  const handleCitationHover = useCallback((_url: string | null) => {
    // No-op: citation hover state not currently consumed
  }, []);

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

  // Debug logging
  useEffect(() => {
    if (Array.isArray(messages)) {
      logger.debug("🖼️ MessageList render", {
        count: messages.length,
        firstRole: messages[0]?.role,
      });
    }
  }, [messages]);

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

  // Wrap the hook's handleLoadMore to pass our onLoadMore callback
  const handleLoadMore = React.useCallback(async () => {
    if (!onLoadMore) return;
    await hookHandleLoadMore(onLoadMore);
  }, [onLoadMore, hookHandleLoadMore]);

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
