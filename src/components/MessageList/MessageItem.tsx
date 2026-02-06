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
import { ToolProgressIndicator } from "./ToolProgressIndicator";
import {
  extractPlainText,
  formatConversationWithWebResearchSources,
} from "@/lib/clipboard";
import type { Message, SearchProgress } from "@/lib/types/message";
import { hasWebResearchSources } from "@/lib/domain/webResearchSources";

interface MessageItemProps {
  message: Message;
  index: number;
  collapsedById: Record<string, boolean>;
  hoveredSourceUrl: string | null;
  onToggleCollapsed: (id: string) => void;
  onDeleteMessage: (messageId: Id<"messages"> | string | undefined) => void;
  onSourceHover: (url: string | null) => void;
  onCitationHover: (url: string | null) => void;
  searchProgress?: SearchProgress | null;
}

export function MessageItem({
  message,
  index,
  collapsedById,
  hoveredSourceUrl,
  onToggleCollapsed,
  onDeleteMessage,
  onSourceHover,
  onCitationHover,
  searchProgress,
}: MessageItemProps) {
  const safeTimestamp =
    typeof message.timestamp === "number" ? message.timestamp : Date.now();
  const messageId = message._id ? String(message._id) : "";
  const canDelete = messageId.length > 0;

  const handleDeleteClick = React.useCallback(() => {
    onDeleteMessage(message._id);
  }, [message._id, onDeleteMessage]);

  return (
    <div
      key={message._id || `message-${index}-${message.timestamp || Date.now()}`}
      className="flex gap-2 sm:gap-4 max-w-full overflow-hidden"
      data-testid={`message-${message.role}`}
      data-chat-id={message.chatId}
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
        {message.role === "assistant" &&
          hasWebResearchSources(message.webResearchSources) && (
            <div className="mb-4">
              <MessageSources
                id={messageId}
                webResearchSources={message.webResearchSources}
                collapsed={collapsedById[messageId] ?? false}
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
              <svg
                className="w-4 h-4 animate-spin"
                fill="none"
                viewBox="0 0 24 24"
              >
                <circle
                  className="opacity-25"
                  cx="12"
                  cy="12"
                  r="10"
                  stroke="currentColor"
                  strokeWidth="4"
                />
                <path
                  className="opacity-75"
                  fill="currentColor"
                  d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                />
              </svg>
              <span>{message.thinking}</span>
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

        {/* 4) Search progress status when streaming */}
        {message.role === "assistant" &&
          searchProgress &&
          searchProgress.stage !== "idle" && (
            <ToolProgressIndicator
              stage={searchProgress.stage}
              message={searchProgress.message}
              toolReasoning={
                typeof searchProgress.toolReasoning === "string"
                  ? searchProgress.toolReasoning
                  : undefined
              }
              toolQuery={
                typeof searchProgress.toolQuery === "string"
                  ? searchProgress.toolQuery
                  : undefined
              }
              toolUrl={
                typeof searchProgress.toolUrl === "string"
                  ? searchProgress.toolUrl
                  : undefined
              }
            />
          )}

        {/* 5) AI/user content last – always appears under sources/thinking */}
        <div className="prose prose-gray max-w-none dark:prose-invert prose-sm mt-2 overflow-x-hidden text-[15px] sm:text-base leading-6">
          {message.role === "assistant" ? (
            <ContentWithCitations
              content={message.content || ""}
              webResearchSources={message.webResearchSources}
              hoveredSourceUrl={hoveredSourceUrl}
              onCitationHover={onCitationHover}
            />
          ) : (
            <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed break-words slashed-zero lining-nums tabular-nums">
              {message.content}
            </div>
          )}
        </div>

        <div className="-mt-1 flex items-start justify-between">
          <div className="text-xs text-gray-500 dark:text-gray-500">
            {new Date(safeTimestamp).toLocaleTimeString()}
          </div>
          <div className="flex items-center gap-2">
            <CopyButton
              text={
                message.role === "assistant"
                  ? formatConversationWithWebResearchSources([
                      {
                        role: message.role,
                        content: message.content || "",
                        webResearchSources: message.webResearchSources,
                      },
                    ])
                  : extractPlainText(message.content || "")
              }
              size="sm"
              title="Copy message"
              ariaLabel="Copy message to clipboard"
            />
            {canDelete && (
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
}
