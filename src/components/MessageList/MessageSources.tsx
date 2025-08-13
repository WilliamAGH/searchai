/**
 * Compact sources component for messages
 * Shows collapsed summary by default
 * Expands to show all sources on click
 */

import React from "react";
import type { SearchResult } from "../../lib/types/message";
import { getFaviconUrl } from "../../lib/utils/favicon";

interface MessageSourcesProps {
  id: string;
  results: SearchResult[];
  method?: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  hoveredSourceUrl: string | null;
  onSourceHover: (url: string | null) => void;
}

/**
 * Extract hostname from URL safely
 */
function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    try {
      return new URL(`https://${url}`).hostname;
    } catch {
      return "";
    }
  }
}

export function MessageSources({
  id,
  results,
  method,
  collapsed,
  onToggle,
  hoveredSourceUrl,
  onSourceHover,
}: MessageSourcesProps) {
  const hostnames = results
    .map((r) => getSafeHostname(r.url) || r.url)
    .filter(Boolean);
  const summary = hostnames.slice(0, 3).join(" · ");

  const handleToggleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggle(id);
    },
    [id, onToggle],
  );

  return (
    <div className="mt-3 max-w-full overflow-hidden">
      <button
        type="button"
        onClick={handleToggleClick}
        className="w-full text-left px-2 sm:px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors touch-manipulation"
        aria-expanded={!collapsed}
        aria-label="Toggle sources display"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 sm:gap-2 text-[15px] sm:text-base text-gray-700 dark:text-gray-300 min-w-0">
            <svg
              className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
              />
            </svg>
            <span className="font-medium">Sources</span>
            <span className="text-gray-500 dark:text-gray-400">
              ({results.length})
            </span>
            {method && (
              <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 truncate">
                via web search
              </span>
            )}
          </div>
          <svg
            className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${collapsed ? "" : "rotate-180"}`}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M19 9l-7 7-7-7"
            />
          </svg>
        </div>
        {collapsed && (
          <div className="mt-1 text-xs sm:text-sm text-gray-500 dark:text-gray-400 truncate">
            {summary}
            {hostnames.length > 3 && ` +${hostnames.length - 3} more`}
          </div>
        )}
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-2 px-2 max-h-[300px] overflow-y-auto">
          {results.map((result, i) => {
            const hostname = getSafeHostname(result.url);
            const isHovered = hoveredSourceUrl === result.url;

            return (
              <a
                key={`${id}-source-${i}`}
                href={result.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`block p-2 sm:p-3 rounded-lg border transition-all ${
                  isHovered
                    ? "border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
                onMouseEnter={() => onSourceHover(result.url)}
                onMouseLeave={() => onSourceHover(null)}
              >
                <div className="flex items-start gap-2">
                  <img
                    src={getFaviconUrl(result.url)}
                    alt=""
                    className="w-4 h-4 mt-0.5 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="font-medium text-[15px] sm:text-base text-gray-900 dark:text-gray-100 line-clamp-1">
                      {result.title}
                    </div>
                    <div className="text-[13px] sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                      {hostname}
                    </div>
                    {result.snippet && (
                      <div className="mt-1 text-[13px] sm:text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                        {result.snippet}
                      </div>
                    )}
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
}
