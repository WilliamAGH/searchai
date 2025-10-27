import React from "react";

interface AgentStatusOverlayProps {
  isGenerating: boolean;
  searchProgress?: {
    stage?: string;
    message?: string;
  } | null;
}

export function AgentStatusOverlay({
  isGenerating,
  searchProgress,
}: AgentStatusOverlayProps) {
  if (!isGenerating) return null;

  const stage = searchProgress?.stage || "working";
  const message =
    searchProgress?.message ||
    (stage === "generating" ? "Writing answer..." : "Working...");

  return (
    <div className="pointer-events-none fixed inset-0 z-40 flex items-end sm:items-start justify-center sm:justify-end p-4 sm:p-6">
      <div className="pointer-events-auto bg-white/90 dark:bg-gray-900/90 backdrop-blur rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 px-4 py-3 flex items-center gap-3 text-sm text-gray-800 dark:text-gray-200">
        <svg
          className="w-4 h-4 text-emerald-600 dark:text-emerald-400 animate-spin"
          viewBox="0 0 24 24"
          fill="none"
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
            d="M4 12a8 8 0 018-8V0A12 12 0 000 12h4z"
          />
        </svg>
        <span className="font-medium capitalize">{stage}</span>
        <span className="text-gray-500 dark:text-gray-400">{message}</span>
      </div>
    </div>
  );
}

export default AgentStatusOverlay;
