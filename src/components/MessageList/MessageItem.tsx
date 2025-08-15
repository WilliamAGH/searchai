/**
 * Individual message item component
 * Handles rendering of user and assistant messages
 */

import React from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ContentWithCitations } from "../ContentWithCitations";
import { ReasoningDisplay } from "../ReasoningDisplay";
import { CopyButton } from "../CopyButton";
import { MessageSources } from "./MessageSources";
import { Spinner } from "../ui/Spinner";
import { LoadingText, LoadingMessages } from "../ui/LoadingText";
import { ThreeDots } from "../ui/ThreeDots";
import {
  extractPlainText,
  formatConversationWithSources,
} from "../../lib/clipboard";
import type { Message } from "../../lib/types/message";

interface MessageItemProps {
  message: Message;
  index: number;
  collapsedById: Record<string, boolean>;
  hoveredSourceUrl: string | null;
  onToggleCollapsed: (id: string) => void;
  onDeleteMessage: (messageId: Id<"messages"> | string | undefined) => void;
  onSourceHover: (url: string | null) => void;
  onCitationHover: (url: string | null) => void;
}

// Memoized MessageItem to prevent unnecessary re-renders during streaming
// Only re-render if the message content or streaming state actually changes
export const MessageItem = React.memo(
  function MessageItem({
    message,
    index,
    collapsedById,
    hoveredSourceUrl,
    onToggleCollapsed,
    onDeleteMessage,
    onSourceHover,
    onCitationHover,
  }: MessageItemProps) {
    const safeTimestamp =
      typeof message.timestamp === "number" ? message.timestamp : Date.now();
    const safeResults = Array.isArray(message.searchResults)
      ? message.searchResults.filter(
          (r) => r && typeof r.url === "string" && typeof r.title === "string",
        )
      : [];

    const messageId = message._id || String(index);

    const handleDeleteClick = React.useCallback(() => {
      onDeleteMessage(message._id);
    }, [message._id, onDeleteMessage]);

    return (
      <div
        key={
          message._id || `message-${index}-${message.timestamp || Date.now()}`
        }
        className="flex gap-2 sm:gap-4 max-w-full overflow-hidden"
        data-role={message.role}
      >
        <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
          {message.role === "user" ? (
            <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
              <svg
                className="w-4 h-4 text-gray-600 dark:text-gray-300"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                />
              </svg>
            </div>
          ) : (
            <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
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
          )}
        </div>
        <div className="flex-1 min-w-0 overflow-hidden">
          {/* 1) Sources (compact/collapsed) first */}
          {message.role === "assistant" && safeResults.length > 0 && (
            <div className="mb-4">
              <MessageSources
                id={messageId}
                results={safeResults}
                method={message.searchMethod}
                collapsed={collapsedById[messageId] ?? true}
                onToggle={onToggleCollapsed}
                hoveredSourceUrl={hoveredSourceUrl}
                onSourceHover={onSourceHover}
              />
            </div>
          )}

          {/* 2) Thinking status - shows real-time AI processing */}
          {message.role === "assistant" &&
            message.thinking &&
            message.thinking.trim() && (
              <div className="flex items-center gap-2 px-3 py-2 mb-2 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 rounded-lg text-sm">
                <Spinner size="sm" aria-label="AI is thinking" />
                <LoadingText message={message.thinking} className="flex-1">
                  {message.isStreaming && (
                    <ThreeDots size="sm" color="bg-blue-500" />
                  )}
                </LoadingText>
              </div>
            )}

          {/* 3) Reasoning / thinking - positioned below sources */}
          {message.role === "assistant" &&
            message.reasoning &&
            message.reasoning.trim() && (
              <div className="mb-4">
                <ReasoningDisplay
                  id={messageId}
                  reasoning={message.reasoning}
                  isStreaming={message.isStreaming}
                  hasStartedContent={Boolean(
                    message.content && message.content.trim(),
                  )}
                  collapsed={collapsedById[`reasoning-${messageId}`] ?? false}
                  onToggle={onToggleCollapsed}
                />
              </div>
            )}

          {/* 4) AI/user content last – always appears under sources/thinking */}
          {/* Only show content if it's not empty or just dots during streaming */}
          {message.content &&
            message.content.trim() &&
            message.content !== "•••" &&
            message.content !== "..." &&
            message.content !== "…" && (
              <div className="prose prose-gray max-w-none dark:prose-invert prose-sm mt-2 overflow-x-hidden text-[15px] sm:text-base leading-6">
                {message.role === "assistant" ? (
                  <ContentWithCitations
                    content={message.content}
                    searchResults={safeResults}
                    hoveredSourceUrl={hoveredSourceUrl}
                    onCitationHover={onCitationHover}
                  />
                ) : (
                  <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed break-words slashed-zero lining-nums tabular-nums">
                    {message.content}
                  </div>
                )}
              </div>
            )}

          <div className="-mt-1 flex items-start justify-between">
            <div className="text-xs text-gray-500 dark:text-gray-500">
              {new Date(safeTimestamp).toLocaleTimeString()}
            </div>
            <div className="flex items-center gap-2">
              <CopyButton
                text={
                  message.role === "assistant"
                    ? formatConversationWithSources([
                        {
                          role: message.role,
                          content: message.content || "",
                          searchResults: message.searchResults,
                          sources: message.sources,
                        },
                      ])
                    : extractPlainText(message.content || "")
                }
                size="sm"
                title="Copy message"
                ariaLabel="Copy message to clipboard"
              />
              {message._id && (
                <button
                  type="button"
                  onClick={handleDeleteClick}
                  className="p-0 text-gray-400 hover:text-red-500 transition-all duration-200"
                  title="Delete message"
                  aria-label="Delete message"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                    aria-hidden="true"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  },
  // Custom comparison function to optimize re-renders
  (prevProps, nextProps) => {
    // Re-render if message content changes
    if (prevProps.message.content !== nextProps.message.content) return false;

    // Re-render if streaming state changes
    if (prevProps.message.isStreaming !== nextProps.message.isStreaming)
      return false;

    // Re-render if thinking state changes
    if (prevProps.message.thinking !== nextProps.message.thinking) return false;

    // Re-render if reasoning changes
    if (prevProps.message.reasoning !== nextProps.message.reasoning)
      return false;

    // Re-render if search results change
    if (
      prevProps.message.searchResults?.length !==
      nextProps.message.searchResults?.length
    )
      return false;

    // Re-render if collapsed state for this message changes
    const messageId = prevProps.message._id || String(prevProps.index);
    if (
      prevProps.collapsedById[messageId] !== nextProps.collapsedById[messageId]
    )
      return false;
    if (
      prevProps.collapsedById[`reasoning-${messageId}`] !==
      nextProps.collapsedById[`reasoning-${messageId}`]
    )
      return false;

    // Re-render if hover state changes for this message's sources
    if (
      prevProps.message.searchResults?.some(
        (r) => r.url === prevProps.hoveredSourceUrl,
      ) !==
      nextProps.message.searchResults?.some(
        (r) => r.url === nextProps.hoveredSourceUrl,
      )
    )
      return false;

    // Skip re-render for all other prop changes
    return true;
  },
);
