import React, { useCallback } from "react";
import { getFaviconUrl, getSafeHostname } from "../lib/utils/favicon";

interface SearchProgressProps {
  progress: {
    stage:
      | "idle"
      | "thinking"
      | "planning"
      | "searching"
      | "scraping"
      | "analyzing"
      | "generating"
      | "finalizing";
    message?: string;
    urls?: string[];
    currentUrl?: string;
    queries?: string[];
    sourcesUsed?: number;
  };
}

export function SearchProgress({ progress }: SearchProgressProps) {
  const handleFaviconError = useCallback(
    (e: React.SyntheticEvent<HTMLImageElement>) => {
      e.currentTarget.style.display = "none";
    },
    [],
  );
  const getStageIcon = (stage: string) => {
    switch (stage) {
      case "planning":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4"
            />
          </svg>
        );
      case "searching":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
        );
      case "scraping":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.246 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
            />
          </svg>
        );
      case "analyzing":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"
            />
          </svg>
        );
      case "generating":
        return (
          <svg
            className="w-4 h-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
            />
          </svg>
        );
      default:
        return null;
    }
  };

  return (
    <div className="flex gap-2 sm:gap-4 max-w-full overflow-hidden">
      {/* Avatar icon matching MessageItem assistant style */}
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
      <div className="flex-1 min-w-0 overflow-hidden">
        {/* Timestamp at top */}
        <div className="text-xs text-gray-500 dark:text-gray-500 mb-1">
          {new Date().toLocaleTimeString()}
        </div>
        <div className="bg-gray-50 dark:bg-gray-800/50 rounded-xl p-3 sm:p-4 border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3 mb-3">
            <div className="text-emerald-600 dark:text-emerald-400 animate-pulse">
              {getStageIcon(progress.stage)}
            </div>
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
              {progress.message}
            </span>
          </div>

          {progress.currentUrl && (
            <div className="flex items-center gap-2 text-xs text-gray-600 dark:text-gray-400 mb-2 min-w-0">
              {getFaviconUrl(progress.currentUrl) ? (
                <img
                  src={getFaviconUrl(progress.currentUrl) as string}
                  alt=""
                  width={12}
                  height={12}
                  className="w-3 h-3 object-contain rounded-sm"
                  onError={handleFaviconError}
                />
              ) : null}
              <span className="truncate min-w-0">
                {getSafeHostname(progress.currentUrl) || progress.currentUrl}
              </span>
            </div>
          )}

          {progress.queries && progress.queries.length > 0 && (
            <div className="mt-2 text-xs text-gray-600 dark:text-gray-400">
              <div className="font-medium mb-1">Search queries:</div>
              <ul className="list-disc list-inside space-y-0.5">
                {progress.queries.map((query, idx) => (
                  <li key={idx} className="truncate min-w-0">
                    {query}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {progress.urls && progress.urls.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-2">
              {progress.urls.map((url, idx) => (
                <div
                  key={`${url}-${idx}`}
                  className="flex items-center gap-1 px-2 py-1 bg-white dark:bg-gray-700 rounded-md text-xs min-w-0"
                >
                  {getFaviconUrl(url) ? (
                    <img
                      src={getFaviconUrl(url) as string}
                      alt=""
                      width={12}
                      height={12}
                      className="w-3 h-3 object-contain rounded-sm"
                      onError={handleFaviconError}
                    />
                  ) : null}
                  <span className="text-gray-600 dark:text-gray-400 break-all whitespace-normal min-w-0">
                    {getSafeHostname(url) || url}
                  </span>
                </div>
              ))}
            </div>
          )}

          <div className="flex items-center gap-2 mt-3">
            <div className="flex space-x-1">
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:0ms]"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:100ms]"></div>
              <div className="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-bounce [animation-delay:200ms]"></div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
