/**
 * ToolProgressIndicator - Progress indicator for AI tool calls
 *
 * Shows the current stage of tool execution with contextual information
 * including the LLM's reasoning and current query/URL being processed.
 */

import React from "react";

/** Animation timing constants (in milliseconds) */
const ANIMATION_DELAY_REASONING = 50;
const ANIMATION_DELAY_TARGET = 100;

/** Progress stages supported by the indicator */
type ProgressStage =
  | "idle"
  | "thinking"
  | "planning"
  | "searching"
  | "scraping"
  | "analyzing"
  | "generating"
  | "finalizing";

interface ToolProgressIndicatorProps {
  stage: ProgressStage;
  message?: string;
  toolReasoning?: string;
  toolQuery?: string;
  toolUrl?: string;
}

/** Stage display text - simple lookup for labels and descriptions */
const STAGE_TEXT: Record<string, { label: string; description: string }> = {
  thinking: { label: "Thinking", description: "about your question" },
  planning: { label: "Planning", description: "research approach" },
  searching: { label: "Searching", description: "the web" },
  scraping: { label: "Reading", description: "source content" },
  analyzing: { label: "Analyzing", description: "results" },
  generating: { label: "Writing", description: "response" },
  finalizing: { label: "Finalizing", description: "response" },
};

const DEFAULT_STAGE_TEXT = { label: "Working", description: "on request" };

/** Get display text for a stage with fallback */
function getStageText(stage: string): { label: string; description: string } {
  return STAGE_TEXT[stage] ?? DEFAULT_STAGE_TEXT;
}

/** Stage-specific icon component */
function StageIcon({ stage }: { stage: ProgressStage }) {
  const iconProps = {
    className: "w-4 h-4 transition-all duration-300",
    fill: "none",
    stroke: "currentColor",
    viewBox: "0 0 24 24",
    strokeLinecap: "round",
    strokeLinejoin: "round",
    strokeWidth: 1.5,
  };

  switch (stage) {
    case "thinking":
      return (
        <svg {...iconProps}>
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      );
    case "planning":
      return (
        <svg {...iconProps}>
          <path d="M9 5H7a2 2 0 00-2 2v10a2 2 0 002 2h8a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" />
        </svg>
      );
    case "searching":
      return (
        <svg {...iconProps}>
          <path d="M21 21l-5.197-5.197m0 0A7.5 7.5 0 105.196 5.196a7.5 7.5 0 0010.607 10.607z" />
        </svg>
      );
    case "scraping":
      return (
        <svg {...iconProps}>
          <path d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m0 12.75h7.5m-7.5 3H12M10.5 2.25H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
        </svg>
      );
    case "analyzing":
      return (
        <svg {...iconProps}>
          <path d="M3.75 3v11.25A2.25 2.25 0 006 16.5h2.25M3.75 3h-1.5m1.5 0h16.5m0 0h1.5m-1.5 0v11.25A2.25 2.25 0 0118 16.5h-2.25m-7.5 0h7.5m-7.5 0l-1 3m8.5-3l1 3m0 0l.5 1.5m-.5-1.5h-9.5m0 0l-.5 1.5" />
        </svg>
      );
    case "generating":
      return (
        <svg {...iconProps}>
          <path d="M16.862 4.487l1.687-1.688a1.875 1.875 0 112.652 2.652L10.582 16.07a4.5 4.5 0 01-1.897 1.13L6 18l.8-2.685a4.5 4.5 0 011.13-1.897l8.932-8.931zm0 0L19.5 7.125" />
        </svg>
      );
    default:
      // Default: sparkle icon
      return (
        <svg {...iconProps}>
          <path d="M9.813 15.904L9 18.75l-.813-2.846a4.5 4.5 0 00-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 003.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 003.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 00-3.09 3.09z" />
        </svg>
      );
  }
}

export function ToolProgressIndicator({
  stage,
  message,
  toolReasoning,
  toolQuery,
  toolUrl,
}: ToolProgressIndicatorProps) {
  if (stage === "idle") return null;

  const displayTarget = toolQuery || toolUrl;
  const stageText = getStageText(stage);

  return (
    <div className="mb-4 animate-slide-up-fade">
      {/* Main container with subtle border */}
      <div className="relative overflow-hidden rounded-lg border border-gray-200/80 dark:border-gray-700/80 bg-gray-50/50 dark:bg-gray-800/30">
        {/* Thin indeterminate progress bar at top */}
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-gray-200/50 dark:bg-gray-700/50 overflow-hidden">
          <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-emerald-500/80 to-transparent animate-progress-indeterminate" />
        </div>

        <div className="p-3 sm:p-4 pt-4">
          {/* Header row: Icon + Stage label */}
          <div className="flex items-center gap-2.5">
            {/* Stage icon with gentle breathing animation */}
            <div className="flex-shrink-0 text-emerald-600 dark:text-emerald-400 animate-breathe">
              <StageIcon stage={stage} />
            </div>

            {/* Stage info */}
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline gap-1.5">
                <span className="text-sm font-medium text-gray-800 dark:text-gray-200">
                  {stageText.label}
                </span>
                <span className="text-xs text-gray-500 dark:text-gray-400">
                  {message || stageText.description}
                </span>
              </div>
            </div>
          </div>

          {/* Tool reasoning - slides in with delay */}
          {toolReasoning && (
            <p
              className="mt-2.5 text-[13px] leading-relaxed text-gray-600 dark:text-gray-400 animate-slide-up-fade"
              style={{ animationDelay: `${ANIMATION_DELAY_REASONING}ms` }}
            >
              {toolReasoning}
            </p>
          )}

          {/* Query/URL display with scan line effect */}
          {displayTarget && (
            <div
              className="mt-2.5 relative overflow-hidden animate-slide-up-fade"
              style={{ animationDelay: `${ANIMATION_DELAY_TARGET}ms` }}
            >
              <div className="px-2.5 py-1.5 rounded-md bg-white/80 dark:bg-gray-900/50 border border-gray-200/60 dark:border-gray-700/60">
                {/* Scan line overlay - subtle highlight sweeping across */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <div className="absolute inset-y-0 w-1/4 bg-gradient-to-r from-transparent via-emerald-500/[0.08] to-transparent animate-scan-line" />
                </div>

                {/* Content */}
                <code className="relative text-xs font-mono text-gray-700 dark:text-gray-300 truncate block">
                  {displayTarget}
                </code>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
