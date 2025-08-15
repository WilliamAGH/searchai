/**
 * Streaming Indicator Component
 * Shows when AI is thinking and generating responses
 * Extracted from MessageList/index.tsx for reuse
 */

import React from "react";
import { ThreeDots } from "./ThreeDots";

interface StreamingIndicatorProps {
  isStreaming: boolean;
  thinking?: string;
  message?: string;
  className?: string;
}

export const StreamingIndicator: React.FC<StreamingIndicatorProps> = ({
  isStreaming,
  thinking,
  message = "AI is thinking and generating response...",
  className = "",
}) => {
  if (!isStreaming) return null;

  return (
    <div className={`flex gap-2 sm:gap-4 ${className}`}>
      <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
        <svg
          className="w-4 h-4 text-white"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </div>
      <div className="flex-1">
        <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
          <svg
            className="w-4 h-4 animate-spin"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
          <span>{thinking || message}</span>
          <ThreeDots size="sm" color="bg-emerald-500" />
        </div>
      </div>
    </div>
  );
};
