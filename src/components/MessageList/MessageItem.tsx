/**
 * Individual message item component
 * Handles rendering of user and assistant messages
 */

import React from "react";
import type { Id } from "../../../convex/_generated/dataModel";
import { ContentWithCitations } from "../ContentWithCitations";
import { MessageSources } from "./MessageSources";
import { ReasoningDisplay } from "../ReasoningDisplay";
import { CopyButton } from "../CopyButton";
import { formatConversationWithSources } from "../../lib/utils/shareFormatter";
import { extractPlainText } from "../../lib/utils/textUtils";
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
  isReadOnly?: boolean;
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
    isReadOnly = false,
  }: MessageItemProps) {
    const mountTimeRef = React.useRef<number>(Date.now());
    const safeTimestamp =
      typeof message.timestamp === "number"
        ? message.timestamp
        : mountTimeRef.current;
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
      <div className="flex gap-2 sm:gap-4 max-w-full" data-role={message.role}>
        <div className="flex-shrink-0 w-10 h-10 flex items-center justify-center">
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
            <div
              className={`relative w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center transition-all duration-300 ${
                message.isStreaming ? "animate-orb-glow" : ""
              }`}
            >
              <svg
                className="w-4 h-4 text-white z-10"
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

          {/* 2) Streaming status text - minimal and elegant */}
          {message.role === "assistant" &&
            message.isStreaming &&
            !message.content?.trim() && (
              <div className="mb-3">
                <span className="text-sm text-gray-500 dark:text-gray-400 italic">
                  {message.thinking || "Processing"}
                  <span className="inline-flex ml-1">
                    <span className="animate-ellipsis-dot">.</span>
                    <span className="animate-ellipsis-dot animation-delay-200">
                      .
                    </span>
                    <span className="animate-ellipsis-dot animation-delay-400">
                      .
                    </span>
                  </span>
                </span>
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
                          searchResults: safeResults,
                          sources: message.sources,
                        },
                      ])
                    : extractPlainText(message.content || "")
                }
                size="sm"
                title="Copy message"
                ariaLabel="Copy message to clipboard"
              />
              {message._id && !isReadOnly && (
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

    // Re-render if search results change (lightweight signature compare)
    const sig = (arr?: typeof prevProps.message.searchResults) =>
      (arr ?? []).map((r) => `${r?.url || ""}|${r?.title || ""}`).join(";");
    if (
      sig(prevProps.message.searchResults) !==
      sig(nextProps.message.searchResults)
    )
      return false;

    // Re-render if search method changes (affects Sources header)
    if (prevProps.message.searchMethod !== nextProps.message.searchMethod)
      return false;

    // Re-render if sources array length changes (affects copy text)
    const srcLen = (s?: string[]) => (s ? s.length : 0);
    if (srcLen(prevProps.message.sources) !== srcLen(nextProps.message.sources))
      return false;

    // Re-render if collapsed state for this message changes (handle ID transitions)
    const prevId = prevProps.message._id || String(prevProps.index);
    const nextId = nextProps.message._id || String(nextProps.index);
    if (prevProps.collapsedById[prevId] !== nextProps.collapsedById[nextId])
      return false;
    if (
      prevProps.collapsedById[`reasoning-${prevId}`] !==
      nextProps.collapsedById[`reasoning-${nextId}`]
    )
      return false;

    // Re-render if hover state changes for this message's sources
    const hasHover = (m: typeof prevProps.message, url: string | null) =>
      !!url && !!m.searchResults?.some((r) => r.url === url);
    if (
      hasHover(prevProps.message, prevProps.hoveredSourceUrl) !==
      hasHover(nextProps.message, nextProps.hoveredSourceUrl)
    ) {
      return false;
    }

    // Skip re-render for all other prop changes
    return true;
  },
);
