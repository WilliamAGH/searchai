/**
 * Load More Messages Button Component
 * Displays at the top of message list for loading older messages
 */

import React from "react";
import { Spinner } from "../ui/Spinner";

interface LoadMoreButtonProps {
  isLoading: boolean;
  hasMore: boolean;
  onLoadMore: () => void;
  messageCount?: number;
}

export function LoadMoreButton({
  isLoading,
  hasMore,
  onLoadMore,
  messageCount = 0,
}: LoadMoreButtonProps) {
  if (!hasMore) {
    if (messageCount > 0) {
      return (
        <div className="text-center py-4 text-sm text-gray-500 dark:text-gray-400">
          Beginning of conversation
        </div>
      );
    }
    return null;
  }

  return (
    <div className="flex justify-center py-4">
      <button
        type="button"
        data-testid="load-more-button"
        onClick={onLoadMore}
        disabled={isLoading}
        className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-emerald-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label="Load older messages"
      >
        {isLoading ? (
          <>
            <Spinner size="sm" aria-label="Loading older messages" />
            <span>Loading messages...</span>
          </>
        ) : (
          <>
            <svg
              className="h-4 w-4"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              xmlns="http://www.w3.org/2000/svg"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 11l5-5m0 0l5 5m-5-5v12"
              />
            </svg>
            <span>Load older messages</span>
          </>
        )}
      </button>
    </div>
  );
}

// Note: MessageLoadingSkeleton functionality has been merged into MessageSkeleton
// Use: import { MessageSkeleton } from "./MessageSkeleton" with variant="simple"
