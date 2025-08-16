/**
 * Skeleton loading component for messages
 * Shows placeholder UI while messages are loading
 */

import React from "react";
import { Spinner } from "../ui/Spinner";
import type { ErrorStateProps } from "../../lib/constants/errorStates";
import { ErrorMessages, RetryConfig } from "../../lib/constants/errorStates";

interface MessageSkeletonProps {
  count?: number;
  className?: string;
  variant?: "message" | "simple" | "lines";
  lines?: number; // For 'lines' variant
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
 * Simple skeleton item for basic loading
 */
function SimpleSkeletonItem() {
  return (
    <div className="flex gap-3" aria-hidden="true">
      <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex-shrink-0" />
      <div className="flex-1 space-y-2">
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-3/4" />
        <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/2" />
      </div>
    </div>
  );
}

/**
 * Line skeleton for generic content
 */
function LineSkeleton({ width }: { width: number }) {
  return (
    <div
      className="h-4 bg-gray-200 dark:bg-gray-700 rounded"
      style={{ width: `${width}%` }}
      aria-hidden="true"
    />
  );
}

/**
 * Message skeleton loading component
 * Shows multiple skeleton items to indicate loading state
 * Supports different variants for different use cases
 */
export function MessageSkeleton({
  count = 3,
  className = "",
  variant = "message",
  lines = 3,
}: MessageSkeletonProps) {
  // Deterministic widths for line variant
  const lineWidths = [75, 90, 65, 80, 70, 85, 60, 95];

  if (variant === "lines") {
    return (
      <div
        className={`animate-pulse space-y-3 ${className}`}
        role="status"
        aria-label="Loading content"
      >
        <span className="sr-only">Loading content, please wait...</span>
        {Array.from({ length: lines }).map((_, i) => (
          <LineSkeleton
            key={`line-${i}`}
            width={lineWidths[i % lineWidths.length]}
          />
        ))}
      </div>
    );
  }

  if (variant === "simple") {
    return (
      <div
        className={`space-y-4 p-4 animate-pulse ${className}`}
        role="status"
        aria-label="Loading"
      >
        <span className="sr-only">Loading, please wait...</span>
        {Array.from({ length: count }).map((_, i) => (
          <SimpleSkeletonItem key={`simple-${i}`} />
        ))}
      </div>
    );
  }

  // Default 'message' variant
  return (
    <div
      className={`space-y-6 sm:space-y-8 ${className}`}
      role="status"
      aria-label="Loading messages"
    >
      <span className="sr-only">Loading messages, please wait...</span>
      {Array.from({ length: count }).map((_, index) => (
        <MessageSkeletonItem key={`skeleton-${index}`} />
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
      <Spinner size="sm" className="-ml-1 mr-2" />
      <span aria-label="Loading more messages">Loading more messages...</span>
    </div>
  );
}

/**
 * Error state with retry button
 * Uses standardized error state props
 */
export function LoadErrorState({
  error: _error,
  onRetry,
  retryCount = 0,
  maxRetries = RetryConfig.DEFAULT_MAX_RETRIES,
  message = ErrorMessages.MESSAGES_FAILED,
  className = "",
}: ErrorStateProps) {
  const canRetry = retryCount < maxRetries && Boolean(onRetry);

  return (
    <div
      className={`flex flex-col items-center justify-center py-8 text-sm ${className}`}
      role="alert"
      aria-live="polite"
    >
      <div className="text-red-500 dark:text-red-400 mb-2">{message}</div>
      {retryCount > 0 && canRetry && (
        <div
          className="text-gray-500 dark:text-gray-400 mb-2"
          aria-live="polite"
        >
          Retry attempt {retryCount} of {maxRetries}
        </div>
      )}
      {canRetry ? (
        <button
          onClick={onRetry}
          className="px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 font-serif dark:font-mono"
          aria-label="Retry loading messages"
        >
          Try Again
        </button>
      ) : retryCount >= maxRetries ? (
        <div className="text-gray-500 dark:text-gray-400">
          {ErrorMessages.RETRY_EXHAUSTED}
        </div>
      ) : null}
    </div>
  );
}
