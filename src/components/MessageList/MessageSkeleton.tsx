/**
 * Skeleton loading component for messages
 * Shows placeholder UI while messages are loading
 */

import React from "react";

interface MessageSkeletonProps {
  count?: number;
  className?: string;
}

/**
 * Single message skeleton item
 */
function MessageSkeletonItem() {
  return (
    <div className="flex gap-2 sm:gap-4 animate-pulse" aria-hidden="true">
      {/* Avatar skeleton */}
      <div className="flex-shrink-0 w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full" />

      {/* Content skeleton */}
      <div className="flex-1 space-y-2">
        {/* Role/name skeleton */}
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-20" />

        {/* Message content skeleton */}
        <div className="space-y-2">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-full" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-5/6" />
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-4/6" />
        </div>
      </div>
    </div>
  );
}

/**
 * Message skeleton loading component
 * Shows multiple skeleton items to indicate loading state
 */
export function MessageSkeleton({ count = 3, className = "" }: MessageSkeletonProps) {
  return (
    <div
      className={`space-y-6 sm:space-y-8 ${className}`}
      role="status"
      aria-label="Loading messages"
    >
      <span className="sr-only">Loading messages, please wait...</span>
      {Array.from({ length: count }).map((_, index) => (
        <MessageSkeletonItem key={index} />
      ))}
    </div>
  );
}

/**
 * Inline loading indicator for when loading more messages
 */
export function LoadingMoreIndicator() {
  return (
    <div
      className="flex items-center justify-center py-4 text-sm text-gray-500 dark:text-gray-400"
      role="status"
      aria-live="polite"
    >
      <svg
        className="animate-spin -ml-1 mr-2 h-4 w-4"
        xmlns="http://www.w3.org/2000/svg"
        fill="none"
        viewBox="0 0 24 24"
        aria-hidden="true"
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
      <span aria-label="Loading more messages">Loading more messages...</span>
    </div>
  );
}

/**
 * Error state with retry button
 */
export function LoadErrorState({
  error: _error,
  onRetry,
  retryCount = 0,
}: {
  error: Error;
  onRetry: () => void;
  retryCount?: number;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-8 text-sm"
      role="alert"
      aria-live="polite"
    >
      <div className="text-red-500 dark:text-red-400 mb-2">Failed to load messages</div>
      {retryCount > 0 && (
        <div className="text-gray-500 dark:text-gray-400 mb-2" aria-live="polite">
          Retry attempt {retryCount} of 3
        </div>
      )}
      <button
        onClick={onRetry}
        className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2"
        aria-label="Retry loading messages"
      >
        Try Again
      </button>
    </div>
  );
}
