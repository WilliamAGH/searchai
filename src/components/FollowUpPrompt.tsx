/**
 * Follow-up prompt banner
 * - Suggests starting a new chat vs continuing current
 * - Shows subtle planner hint (reason + confidence)
 * - Minimal, unobtrusive UI for quick choice
 */

import React from "react";

interface FollowUpPromptProps {
  isOpen: boolean;
  onContinue: () => void;
  onNewChat: () => void;
  onNewChatWithSummary?: () => void;
  /** Short reason string from planner (already sanitized) */
  hintReason?: string;
  /** Confidence 0-1 from planner */
  hintConfidence?: number;
}

export function FollowUpPrompt({
  isOpen,
  onContinue,
  onNewChat,
  onNewChatWithSummary,
  hintReason,
  hintConfidence,
}: FollowUpPromptProps) {
  if (!isOpen) return null;

  const confidencePct =
    typeof hintConfidence === "number"
      ? Math.round(hintConfidence * 100)
      : undefined;

  return (
    <div
      role="status"
      className="absolute bottom-[5.5rem] w-full max-w-3xl mx-auto left-0 right-0 px-3 animate-slide-up z-40"
    >
      <div className="w-full border border-amber-200 dark:border-amber-800 bg-amber-50/70 dark:bg-amber-900/20 text-amber-900 dark:text-amber-200 rounded-md">
        <div className="px-3 sm:px-4 py-2">
          {/* Headline row */}
          <div className="flex items-center gap-2 mb-1">
            <svg
              className="w-4 h-4 text-amber-600 dark:text-amber-300"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
            <span className="text-sm font-medium">
              This looks like a new topic.
            </span>
          </div>

          {/* Content + actions row */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:gap-3 gap-2">
            <div
              className="text-xs text-amber-800/90 dark:text-amber-200/90 sm:flex-1 min-w-0 truncate sm:whitespace-normal"
              title="New chats keep results focused. Choose how to continue."
            >
              New chats keep results focused. Choose how to continue.
              {(hintReason || confidencePct !== undefined) && (
                <span className="ml-2 inline-flex items-center gap-1">
                  {confidencePct !== undefined && (
                    <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100/60 dark:bg-amber-900/30 border border-amber-300/60 dark:border-amber-700/60 text-[11px]">
                      {confidencePct}%
                    </span>
                  )}
                  {hintReason && (
                    <span className="truncate" title={hintReason}>
                      {hintReason}
                    </span>
                  )}
                </span>
              )}
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto sm:ml-auto sm:flex-row sm:flex-wrap md:flex-nowrap sm:justify-end shrink-0">
              <button
                type="button"
                onClick={onNewChat}
                className="px-2.5 md:px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-[11px] md:text-xs font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
              >
                Start New Chat
              </button>
              {onNewChatWithSummary && (
                <button
                  type="button"
                  onClick={onNewChatWithSummary}
                  className="px-2.5 md:px-3 py-1.5 bg-emerald-600/90 hover:bg-emerald-700 text-white text-[11px] md:text-xs font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
                >
                  New Chat w/ Summary
                </button>
              )}
              <button
                type="button"
                onClick={onContinue}
                className="px-2.5 md:px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-[11px] md:text-xs font-medium rounded-md transition-colors whitespace-nowrap w-full sm:w-auto"
              >
                Continue Here
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
