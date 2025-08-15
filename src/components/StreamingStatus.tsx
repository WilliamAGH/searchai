/**
 * Unified Streaming Status Component
 * Provides seamless transitions between search, thinking, and streaming states
 * with smooth animations and consistent visual language
 */

import React, { useEffect, useState } from "react";

interface StreamingStatusProps {
  stage: "idle" | "searching" | "thinking" | "streaming" | "complete";
  message?: string;
  progress?: {
    current?: number;
    total?: number;
  };
  searchResults?: number;
  className?: string;
}

// Animated dots with CSS animation
function AnimatedDots() {
  return (
    <span className="inline-flex items-center ml-1">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="w-1 h-1 bg-current rounded-full mx-0.5 animate-pulse"
          style={{
            animationDelay: `${i * 200}ms`,
            animationDuration: '1.5s',
          }}
        />
      ))}
    </span>
  );
}

// Progress bar component
function ProgressBar({ value, max = 100 }: { value: number; max?: number }) {
  const percentage = Math.min(100, (value / max) * 100);
  
  return (
    <div className="w-full h-1 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
      <div
        className="h-full bg-gradient-to-r from-blue-500 to-emerald-500 transition-all duration-300 ease-out"
        style={{ width: `${percentage}%` }}
      />
    </div>
  );
}

// Status icon with CSS animations
function StatusIcon({ stage }: { stage: StreamingStatusProps["stage"] }) {
  const icons = {
    searching: (
      <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
        />
      </svg>
    ),
    thinking: (
      <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
        />
      </svg>
    ),
    streaming: (
      <svg className="w-4 h-4 animate-pulse" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M13 10V3L4 14h7v7l9-11h-7z"
        />
      </svg>
    ),
    complete: (
      <svg 
        className="w-4 h-4 animate-scale-in" 
        fill="none" 
        stroke="currentColor" 
        viewBox="0 0 24 24"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M5 13l4 4L19 7"
        />
      </svg>
    ),
    idle: null,
  };

  return icons[stage];
}

export function StreamingStatus({
  stage,
  message,
  progress,
  searchResults,
  className = "",
}: StreamingStatusProps) {
  const [displayMessage, setDisplayMessage] = useState(message || "");
  const [isVisible, setIsVisible] = useState(false);

  // Smooth message transitions
  useEffect(() => {
    if (message && message !== displayMessage) {
      // Fade out old message
      setIsVisible(false);
      setTimeout(() => {
        setDisplayMessage(message);
        setIsVisible(true);
      }, 150);
    } else if (message) {
      setIsVisible(true);
    }
  }, [message, displayMessage]);

  // Auto-hide when idle
  useEffect(() => {
    if (stage === "idle" || stage === "complete") {
      const timer = setTimeout(() => setIsVisible(false), 500);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(true);
    }
  }, [stage]);

  // Generate contextual messages
  const getStatusMessage = () => {
    if (displayMessage) return displayMessage;
    
    switch (stage) {
      case "searching":
        return searchResults 
          ? `Found ${searchResults} results`
          : "Searching the web";
      case "thinking":
        return "Analyzing information";
      case "streaming":
        return "Composing response";
      case "complete":
        return "Response complete";
      default:
        return "";
    }
  };

  const statusMessage = getStatusMessage();
  const showDots = stage === "searching" || stage === "thinking" || stage === "streaming";
  const showProgress = progress && (progress.current !== undefined || progress.total !== undefined);

  if (stage === "idle") return null;

  return (
    <div
      className={`flex flex-col gap-2 transition-all duration-200 ${className} ${
        isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 -translate-y-2'
      }`}
    >
      <div className="flex items-center gap-2">
        {stage !== "idle" && (
          <div
            className={`
              flex items-center justify-center w-6 h-6 rounded-full transition-all duration-300
              ${stage === "searching" ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400" : ""}
              ${stage === "thinking" ? "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400" : ""}
              ${stage === "streaming" ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400" : ""}
              ${stage === "complete" ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400" : ""}
            `}
          >
            <StatusIcon stage={stage} />
          </div>
        )}
        
        <span
          className={`
            text-sm font-medium transition-opacity duration-150
            ${stage === "searching" ? "text-blue-700 dark:text-blue-300" : ""}
            ${stage === "thinking" ? "text-purple-700 dark:text-purple-300" : ""}
            ${stage === "streaming" ? "text-emerald-700 dark:text-emerald-300" : ""}
            ${stage === "complete" ? "text-green-700 dark:text-green-300" : ""}
            ${isVisible ? 'opacity-100' : 'opacity-0'}
          `}
        >
          {statusMessage}
          {showDots && <AnimatedDots />}
        </span>
      </div>
      
      {showProgress && progress && (
        <ProgressBar 
          value={progress.current || 0} 
          max={progress.total || 100} 
        />
      )}
    </div>
  );
}

// Compact version for inline use
export function StreamingStatusCompact({ 
  stage, 
  className = "" 
}: Pick<StreamingStatusProps, "stage" | "className">) {
  if (stage === "idle" || stage === "complete") return null;
  
  return (
    <div
      className={`inline-flex items-center gap-1.5 transition-opacity duration-200 ${className}`}
    >
      <div className="w-3 h-3 animate-spin">
        <div className={`
          w-full h-full rounded-full border-2 border-t-transparent
          ${stage === "searching" ? "border-blue-500" : ""}
          ${stage === "thinking" ? "border-purple-500" : ""}
          ${stage === "streaming" ? "border-emerald-500" : ""}
        `} />
      </div>
      <span className="text-xs text-gray-500 dark:text-gray-400">
        {stage === "searching" && "Searching"}
        {stage === "thinking" && "Thinking"}
        {stage === "streaming" && "Writing"}
      </span>
    </div>
  );
}
