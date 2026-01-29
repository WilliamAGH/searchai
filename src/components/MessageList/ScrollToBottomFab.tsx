/**
 * Floating action button to scroll to bottom
 * Shows when user has scrolled up
 */

import React from "react";

interface ScrollToBottomFabProps {
  visible: boolean;
  onClick: () => void;
  unseenCount?: number;
}

export function ScrollToBottomFab({
  visible,
  onClick,
  unseenCount = 0,
}: ScrollToBottomFabProps) {
  if (!visible) return null;

  return (
    <button
      type="button"
      onClick={onClick}
      className="fixed fab-bottom right-4 sm:right-6 z-40 p-3 bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 rounded-full shadow-lg hover:shadow-xl hover:bg-gray-50 dark:hover:bg-gray-700 transition-all duration-200 transform hover:scale-105"
      aria-label={`Scroll to bottom${unseenCount > 0 ? ` (${unseenCount} new message${unseenCount > 1 ? "s" : ""})` : ""}`}
    >
      <div className="relative">
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 14l-7 7m0 0l-7-7m7 7V3"
          />
        </svg>
        {unseenCount > 0 && (
          <span className="absolute -top-2 -right-2 flex items-center justify-center min-w-[20px] h-5 px-1.5 text-xs font-bold text-white bg-emerald-500 rounded-full animate-pulse">
            {unseenCount > 99 ? "99+" : unseenCount}
          </span>
        )}
      </div>
    </button>
  );
}
