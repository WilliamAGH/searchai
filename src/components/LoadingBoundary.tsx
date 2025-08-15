/**
 * Loading boundary component with Suspense support
 * Provides fallback UI for lazy-loaded components and data fetching
 */

import React, { Suspense, type ReactNode } from "react";
import { Spinner } from "./ui/Spinner";

interface LoadingBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  message?: string;
}

/**
 * Default loading spinner component
 */
const DefaultLoadingFallback = ({
  message = "Loading...",
}: {
  message?: string;
}) => (
  <div className="flex items-center justify-center min-h-[200px] text-center">
    <div className="space-y-4">
      <div className="inline-flex items-center justify-center">
        <Spinner size="lg" className="text-gray-500" />
      </div>
      <p className="text-sm text-gray-500">{message}</p>
    </div>
  </div>
);

/**
 * Loading boundary wrapper with Suspense
 * Catches loading states and shows fallback UI
 */
export const LoadingBoundary: React.FC<LoadingBoundaryProps> = ({
  children,
  fallback,
  message,
}) => {
  return (
    <Suspense
      fallback={fallback || <DefaultLoadingFallback message={message} />}
    >
      {children}
    </Suspense>
  );
};

/**
 * Minimal loading indicator for inline use
 */
export const InlineLoading = () => (
  <span className="inline-flex items-center gap-2 text-sm text-gray-500">
    <Spinner size="sm" />
    <span>Loading...</span>
  </span>
);

// Note: SkeletonLoader functionality has been merged into MessageSkeleton
// Use: import { MessageSkeleton } from "./MessageList/MessageSkeleton" with variant="lines"
