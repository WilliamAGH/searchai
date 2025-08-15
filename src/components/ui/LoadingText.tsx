/**
 * Unified Loading Text Component
 * Provides consistent loading text displays across the application
 */

import React from "react";

interface LoadingTextProps {
  message?: string;
  className?: string;
  children?: React.ReactNode;
}

// Default loading messages for consistency
export const LoadingMessages = {
  DEFAULT: "Loading",
  GENERATING: "Generating response",
  GENERATING_SHORT: "Generating",
  PROCESSING: "Processing",
  CREATING: "Creating",
  LOADING_MESSAGES: "Loading messages",
  LOADING_MORE: "Loading more messages",
  LOADING_INTERFACE: "Loading chat interface",
  THINKING: "AI is thinking and generating response",
} as const;

export const LoadingText: React.FC<LoadingTextProps> = ({
  message = LoadingMessages.DEFAULT,
  className = "",
  children,
}) => {
  return (
    <span
      className={`inline-flex items-center gap-2 ${className}`}
      role="status"
      aria-live="polite"
    >
      <span>{message}</span>
      {children}
    </span>
  );
};
