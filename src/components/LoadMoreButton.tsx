/**
 * Load more button component for message pagination
 * Displays a button to load earlier messages in chat history
 */

import { ChevronUp } from "lucide-react";
import { Spinner } from "./ui/Spinner";

interface LoadMoreButtonProps {
  onClick: () => void;
  isLoading: boolean;
  hasMore: boolean;
}

export function LoadMoreButton({
  onClick,
  isLoading,
  hasMore,
}: LoadMoreButtonProps) {
  if (!hasMore) return null;

  return (
    <div
      className="flex justify-center py-4"
      role="region"
      aria-label="Message pagination"
    >
      <button
        onClick={onClick}
        disabled={isLoading}
        className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-200 
                   bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 
                   rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 
                   focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 
                   disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        aria-label={
          isLoading ? "Loading earlier messages" : "Load earlier messages"
        }
        aria-busy={isLoading}
        aria-live="polite"
      >
        {isLoading ? (
          <>
            <Spinner size="sm" aria-label="Loading more messages" />
            <span>Loading...</span>
          </>
        ) : (
          <>
            <ChevronUp className="w-4 h-4" aria-hidden="true" />
            <span>Load earlier messages</span>
          </>
        )}
      </button>
    </div>
  );
}
