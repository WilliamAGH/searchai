/**
 * Message Sources (Web Research Sources)
 *
 * Renders the canonical `webResearchSources` domain object.
 * UI cards are derived-only via a single adapter.
 */

import React from "react";
import { CopyButton } from "@/components/CopyButton";
import { buildSourceRecordSnapshotMarkdown } from "@/lib/domain/sourceContextMarkdown";
import {
  hasWebResearchSources,
  toWebSourceCards,
} from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "@/lib/utils/favicon";

type CrawlState = "succeeded" | "failed" | "not_attempted" | "not_applicable";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function getSourceCrawlState(source: {
  type?: WebResearchSourceClient["type"];
  metadata?: WebResearchSourceClient["metadata"];
}): CrawlState {
  if (source.type === "research_summary") {
    return "not_applicable";
  }
  if (source.type === "scraped_page") {
    return "succeeded";
  }
  if (!isRecord(source.metadata)) {
    return "not_attempted";
  }

  const attempted = source.metadata.crawlAttempted;
  const succeeded = source.metadata.crawlSucceeded;
  if (source.metadata.markedLowRelevance === true) {
    return "not_attempted";
  }
  if (attempted === true && succeeded === false) {
    return "failed";
  }
  if (attempted === true && succeeded === true) {
    return "succeeded";
  }
  return "not_attempted";
}

function getServerContextMarkdown(
  metadata: WebResearchSourceClient["metadata"],
): string | undefined {
  if (!isRecord(metadata)) {
    return undefined;
  }
  const raw = metadata.serverContextMarkdown;
  return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

interface MessageSourcesProps {
  id: string;
  webResearchSources: WebResearchSourceClient[] | undefined;
  collapsed: boolean;
  onToggle: (id: string) => void;
  hoveredSourceUrl: string | null;
  onSourceHover: (url: string | null) => void;
}

export function MessageSources({
  id,
  webResearchSources,
  collapsed,
  onToggle,
  hoveredSourceUrl,
  onSourceHover,
}: MessageSourcesProps) {
  const messageId = id || "unknown";
  const handleToggleClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      e.preventDefault();
      onToggle(messageId);
    },
    [messageId, onToggle],
  );
  if (!hasWebResearchSources(webResearchSources)) return null;

  const displaySources = toWebSourceCards(webResearchSources);
  const previewSources = displaySources.slice(0, 3);
  const showDevSourceContextCopy = import.meta.env.DEV;
  const sourceRows = displaySources.map((source) => ({
    source,
    crawlState: getSourceCrawlState(source),
    markedLowRelevance: source.metadata?.markedLowRelevance === true,
    serverContextMarkdown: showDevSourceContextCopy
      ? getServerContextMarkdown(source.metadata)
      : undefined,
  }));

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
              const favicon = getFaviconUrl(source.url);
              return (
                <a
                  key={`${messageId}-preview-${source.url}-${i}`}
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full bg-gray-100 dark:bg-gray-700 hover:bg-gray-200 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-300 transition-colors"
                >
                  {favicon && (
                    <img src={favicon} alt="" className="w-3 h-3 rounded" />
                  )}
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
          {sourceRows.map(
            (
              { source, crawlState, markedLowRelevance, serverContextMarkdown },
              i,
            ) => {
              const hostname =
                getDomainFromUrl(source.url) || getSafeHostname(source.url);
              const favicon = getFaviconUrl(source.url);
              const isHovered = hoveredSourceUrl === source.url;
              const crawlStatus =
                source.type === "research_summary"
                  ? null
                  : markedLowRelevance
                    ? {
                        label: "Low relevance source",
                        dotColor: "bg-slate-500/70 dark:bg-slate-400/70",
                      }
                    : crawlState === "succeeded"
                      ? {
                          label: "Crawl successful",
                          dotColor: "bg-emerald-500/80",
                        }
                      : crawlState === "failed"
                        ? {
                            label: "Crawl attempted, failed",
                            dotColor: "bg-amber-500/80",
                          }
                        : null;

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
                      label: "crawled",
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
                <div
                  key={`${messageId}-source-${source.url}-${i}`}
                  className="flex items-start gap-2"
                >
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={`block flex-1 min-w-0 p-2 sm:p-3 rounded-lg border transition-all ${
                      isHovered
                        ? "border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20"
                        : "border-gray-200 dark:border-gray-700 hover:border-emerald-300 dark:hover:border-emerald-700 hover:bg-gray-50 dark:hover:bg-gray-800/50"
                    }`}
                    onMouseEnter={() => onSourceHover(source.url)}
                    onMouseLeave={() => onSourceHover(null)}
                  >
                    <div className="flex items-start gap-2">
                      {favicon && (
                        <img
                          src={favicon}
                          alt=""
                          className="w-4 h-4 mt-0.5 rounded"
                        />
                      )}
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
                        <div className="text-sm text-gray-600 dark:text-gray-400 truncate">
                          <span className="inline-flex items-center gap-1.5">
                            {crawlStatus && (
                              <span
                                className={`w-1.5 h-1.5 rounded-full ${crawlStatus.dotColor}`}
                                title={crawlStatus.label}
                                aria-label={crawlStatus.label}
                              />
                            )}
                            <span>{hostname}</span>
                          </span>
                        </div>
                      </div>
                    </div>
                  </a>
                  {showDevSourceContextCopy && (
                    <CopyButton
                      text={
                        serverContextMarkdown ??
                        buildSourceRecordSnapshotMarkdown({
                          contextId: source.contextId,
                          url: source.url,
                          title: source.title,
                          type: source.type,
                          relevanceScore: source.relevanceScore,
                          metadata: source.metadata,
                        })
                      }
                      size="sm"
                      className="mt-2 sm:mt-3 shrink-0"
                      title={
                        serverContextMarkdown
                          ? "Copy Convex source context (Markdown)"
                          : "Copy persisted source snapshot (Markdown)"
                      }
                      ariaLabel={
                        serverContextMarkdown
                          ? "Copy Convex source context markdown"
                          : "Copy persisted source snapshot markdown"
                      }
                    />
                  )}
                </div>
              );
            },
          )}
        </div>
      )}
    </div>
  );
}
