/**
 * Empty state component for message list
 * Shows when no messages are present
 */

import React from "react";

interface EmptyStateProps {
  onToggleSidebar: () => void;
}

export function EmptyState({ onToggleSidebar }: EmptyStateProps) {
  return (
    <div className="flex-1 flex items-center justify-center min-h-[60vh]">
      <div className="text-center max-w-sm sm:max-w-lg px-4 sm:px-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 transform hover:scale-105"
          title="Toggle chat history"
        >
          <svg
            className="w-8 h-8 text-white"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        </button>
        <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-white">
          Search the web with AI
        </h2>
        <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
          Ask me anything and I'll search the web in real-time to give you
          accurate, up-to-date information with sources.
        </p>
      </div>
    </div>
  );
}
