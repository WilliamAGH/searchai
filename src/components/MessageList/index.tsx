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
import type { Chat } from "../../lib/types/chat";
import type { Message } from "../../lib/types/message";

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
}

/**
 * Main message list component
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
}: MessageListProps) {
  const deleteMessage = useMutation(api.messages.deleteMessage);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapsedById, setCollapsedById] = React.useState<
    Record<string, boolean>
  >({});
  const [userHasScrolled, setUserHasScrolled] = React.useState(false);
  const [hoveredSourceUrl, setHoveredSourceUrl] = React.useState<string | null>(
    null,
  );

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
    if (Array.isArray(messages)) {
      logger.debug("🖼️ MessageList render", {
        count: messages.length,
        firstRole: messages[0]?.role,
      });
    }
  }, [messages]);

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

  // Auto-collapse sources when thinking begins
  useEffect(() => {
    setCollapsedById((prev) => {
      const updates: Record<string, boolean> = {};

      messages.forEach((m, index) => {
        const id = m._id || String(index);
        if (!id || m.role !== "assistant") return;

        const hasReasoning = Boolean(m.reasoning && m.reasoning.trim());
        const hasContent = Boolean(m.content && m.content.trim());
        const isStreaming = Boolean(m.isStreaming);

        // Sources should collapse when streaming begins
        if (m.searchResults && m.searchResults.length > 0) {
          const sourceId = id;
          if (prev[sourceId] === undefined) {
            updates[sourceId] = isStreaming || hasReasoning || hasContent;
          }
        }

        // Reasoning should only collapse when content starts
        if (hasReasoning) {
          const reasoningId = `reasoning-${id}`;
          if (prev[reasoningId] === undefined) {
            updates[reasoningId] = hasContent;
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

  return (
    <div
      ref={scrollContainerRef}
      className="flex-1 overflow-y-auto relative overscroll-contain"
    >
      <ScrollToBottomFab
        visible={userHasScrolled && messages.length > 0}
        onClick={handleScrollToBottom}
      />

      {messages.length === 0 ? (
        <EmptyState onToggleSidebar={onToggleSidebar} />
      ) : (
        <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
          {messages.map((message, index) => (
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
          ))}

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
