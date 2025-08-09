/**
 * Follow-up prompt banner
 * - Suggests starting a new chat vs continuing current
 * - Shows subtle planner hint (reason + confidence)
 * - Minimal, unobtrusive UI for quick choice
 */

import React from 'react';

interface FollowUpPromptProps {
  isOpen: boolean;
  onContinue: () => void;
  onNewChat: () => void;
  /** Short reason string from planner (already sanitized) */
  hintReason?: string;
  /** Confidence 0-1 from planner */
  hintConfidence?: number;
}

export function FollowUpPrompt({ isOpen, onContinue, onNewChat, hintReason, hintConfidence }: FollowUpPromptProps) {
  if (!isOpen) return null;

  const confidencePct = typeof hintConfidence === 'number' ? Math.round(hintConfidence * 100) : undefined;

  return (
    <div className="absolute bottom-0 left-0 right-0 z-50 p-4 animate-slide-up">
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-amber-200 dark:border-amber-800 shadow-lg max-w-md mx-auto">
        <div className="p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-amber-500 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-1">
                New Question Detected
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-400 mb-2">
                Starting a new chat may yield a cleaner, focused answer.
              </p>
              {(hintReason || confidencePct !== undefined) && (
                <div className="text-[11px] text-amber-700 dark:text-amber-300 mb-3 flex items-center gap-2">
                  <span className="inline-flex items-center px-1.5 py-0.5 rounded bg-amber-100/60 dark:bg-amber-900/30 border border-amber-300/60 dark:border-amber-700/60">
                    {confidencePct !== undefined ? `${confidencePct}%` : ''}
                  </span>
                  <span className="truncate">{hintReason}</span>
                </div>
              )}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onNewChat}
                  className="flex-1 px-3 py-1.5 bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-medium rounded-md transition-colors"
                >
                  Start New Chat
                </button>
                <button
                  type="button"
                  onClick={onContinue}
                  className="flex-1 px-3 py-1.5 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 text-xs font-medium rounded-md transition-colors"
                >
                  Continue Here
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}