/**
 * Loading boundary component with Suspense support
 * Provides fallback UI for lazy-loaded components and data fetching
 */

import React, { Suspense, type ReactNode } from "react";

interface LoadingBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  message?: string;
}

/**
 * Default loading spinner component
 */
const DefaultLoadingFallback = ({ message = "Loading..." }: { message?: string }) => (
  <div className="flex items-center justify-center min-h-[200px] text-center">
    <div className="space-y-4">
      <div className="inline-flex items-center justify-center">
        <svg
          className="animate-spin h-8 w-8 text-gray-500"
          xmlns="http://www.w3.org/2000/svg"
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
    <Suspense fallback={fallback || <DefaultLoadingFallback message={message} />}>
      {children}
    </Suspense>
  );
};

/**
 * Minimal loading indicator for inline use
 */
export const InlineLoading = () => (
  <span className="inline-flex items-center gap-2 text-sm text-gray-500">
    <svg
      className="animate-spin h-4 w-4"
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
    >
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
    <span>Loading...</span>
  </span>
);

/**
 * Skeleton loader for content placeholders
 */
export const SkeletonLoader = ({ lines = 3 }: { lines?: number }) => {
  // Use deterministic widths based on index instead of Math.random()
  const widths = [75, 90, 65, 80, 70, 85, 60, 95];

  return (
    <div className="animate-pulse space-y-3">
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 bg-gray-200 rounded"
          style={{ width: `${widths[i % widths.length]}%` }}
        />
      ))}
    </div>
  );
};
