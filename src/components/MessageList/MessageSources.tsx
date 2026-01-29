/**
 * Compact sources component for messages
 * Shows collapsed summary by default
 * Expands to show all sources on click
 *
 * Supports both legacy searchResults and new contextReferences from agent workflow
 */

import React from "react";
import type { ContextReference, SearchResult } from "@/lib/types/message";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "@/lib/utils/favicon";
import { logger } from "@/lib/logger";

interface MessageSourcesProps {
  id: string;
  results: SearchResult[];
  method?: string;
  collapsed: boolean;
  onToggle: (id: string) => void;
  hoveredSourceUrl: string | null;
  onSourceHover: (url: string | null) => void;
  // New: Support contextReferences from agent workflow
  contextReferences?: ContextReference[];
}

export function MessageSources({
  id,
  results,
  method,
  collapsed,
  onToggle,
  hoveredSourceUrl,
  onSourceHover,
  contextReferences,
}: MessageSourcesProps) {
  // Ensure id is always defined to prevent React key warnings
  const messageId = id || "unknown";

  // Prefer contextReferences from agent workflow, fallback to legacy results
  const hasContextRefs =
    Array.isArray(contextReferences) && contextReferences.length > 0;

  const hasUrl = (
    ref: ContextReference,
  ): ref is ContextReference & { url: string } =>
    typeof ref.url === "string" && ref.url.length > 0;

  // Convert contextReferences to display format
  const displaySources: Array<{
    url: string;
    title: string;
    snippet?: string;
    type?: "search_result" | "scraped_page" | "research_summary";
    relevanceScore?: number;
  }> = hasContextRefs
    ? contextReferences.filter(hasUrl).map((ref) => {
        const safeUrl = ref.url;
        let inferredTitle = ref.title;
        if (!inferredTitle) {
          try {
            inferredTitle = new URL(safeUrl).hostname;
          } catch (error) {
            logger.warn("Failed to infer title from source URL", {
              url: safeUrl,
              error,
            });
            inferredTitle = safeUrl;
          }
        }

        return {
          url: safeUrl,
          title: inferredTitle,
          type: ref.type,
          relevanceScore: ref.relevanceScore,
        };
      })
    : results.map((r) => ({
        url: r.url,
        title: r.title,
        snippet: r.snippet,
        relevanceScore: r.relevanceScore,
      }));

  // Keep track of sources for pills (first 3)
  const previewSources = displaySources.slice(0, 3);

  const handleToggleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggle(messageId);
    },
    [messageId, onToggle],
  );

  return (
    <div className="mt-3 max-w-full min-w-0 overflow-hidden">
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
              ({displaySources.length})
            </span>
            {hasContextRefs && (
              <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 truncate">
                via agent research
              </span>
            )}
            {!hasContextRefs && method && (
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
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            {previewSources.map((source, i) => {
              const hostname =
                getDomainFromUrl(source.url) || getSafeHostname(source.url);
              return (
                <a
                  key={`${messageId}-preview-${i}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  <img
                    src={getFaviconUrl(source.url) ?? undefined}
                    alt=""
                    className="w-3 h-3 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <span className="max-w-[120px] truncate">{hostname}</span>
                </a>
              );
            })}
            {displaySources.length > 3 && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                +{displaySources.length - 3} more
              </span>
            )}
          </div>
        )}
      </button>

      {!collapsed && (
        <div className="mt-2 space-y-2 px-2 max-h-[300px] overflow-y-auto">
          {displaySources.map((source, i) => {
            const hostname =
              getDomainFromUrl(source.url) || getSafeHostname(source.url);
            const isHovered = hoveredSourceUrl === source.url;

            // Determine relevance badge color
            const relevanceBadge =
              source.relevanceScore !== undefined &&
              source.relevanceScore >= 0.8
                ? {
                    label: "high",
                    color:
                      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300",
                  }
                : source.relevanceScore !== undefined &&
                    source.relevanceScore >= 0.5
                  ? {
                      label: "medium",
                      color:
                        "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300",
                    }
                  : null;

            const typeBadge =
              source.type === "scraped_page"
                ? {
                    label: "scraped",
                    color:
                      "bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300",
                  }
                : source.type === "research_summary"
                  ? {
                      label: "summary",
                      color:
                        "bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-300",
                    }
                  : null;

            return (
              <a
                key={`${messageId}-source-${i}`}
                href={source.url}
                target="_blank"
                rel="noopener noreferrer"
                className={`block p-2 sm:p-3 rounded-lg border transition-all ${
                  isHovered
                    ? "border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
                    : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                }`}
                onMouseEnter={() => onSourceHover(source.url)}
                onMouseLeave={() => onSourceHover(null)}
              >
                <div className="flex items-start gap-2">
                  <img
                    src={getFaviconUrl(source.url) ?? undefined}
                    alt=""
                    className="w-4 h-4 mt-0.5 rounded"
                    onError={(e) => {
                      e.currentTarget.style.display = "none";
                    }}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1 flex-wrap">
                      <div className="font-medium text-[15px] sm:text-base text-gray-900 dark:text-gray-100 line-clamp-1 flex-1 min-w-0">
                        {source.title}
                      </div>
                      {typeBadge && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded flex-shrink-0 ${typeBadge.color}`}
                        >
                          {typeBadge.label}
                        </span>
                      )}
                      {relevanceBadge && (
                        <span
                          className={`px-1.5 py-0.5 text-[10px] sm:text-xs font-medium rounded flex-shrink-0 ${relevanceBadge.color}`}
                        >
                          {relevanceBadge.label}
                        </span>
                      )}
                    </div>
                    <div className="text-[13px] sm:text-sm text-gray-500 dark:text-gray-400 truncate">
                      {hostname}
                    </div>
                    {source.snippet && (
                      <div className="mt-1 text-[13px] sm:text-sm text-gray-600 dark:text-gray-300 line-clamp-2">
                        {source.snippet}
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
