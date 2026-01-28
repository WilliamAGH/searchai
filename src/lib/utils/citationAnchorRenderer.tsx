/**
 * Shared citation anchor renderer for markdown components.
 * Single source of truth for citation pill styling and hover behavior.
 */

import React from "react";
import clsx from "clsx";
import type { Components } from "react-markdown";
import { getDomainFromUrl } from "./favicon";
import { logger } from "@/lib/logger";

/** Style classes for citation pills */
const CITATION_PILL_BASE =
  "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-[15px] sm:text-base font-medium transition-colors no-underline align-baseline citation-pill";

const CITATION_PILL_NORMAL =
  "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300";

const CITATION_PILL_HIGHLIGHTED =
  "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600";

/**
 * Creates an anchor renderer that styles citations as interactive pills.
 * Citations are detected by checking if the href URL exists in citationUrls set.
 *
 * @param citationUrls - Set of URLs that should render as citation pills
 * @param hoveredSourceUrl - Currently hovered source URL for highlight state
 * @param onCitationHover - Callback for hover state changes
 */
export function createCitationAnchorRenderer(
  citationUrls: Set<string> | null | undefined,
  hoveredSourceUrl: string | null | undefined,
  onCitationHover: ((url: string | null) => void) | undefined,
): NonNullable<Components["a"]> {
  // Defensive: treat null/undefined as empty set
  const urls = citationUrls ?? new Set<string>();

  return function CitationAnchor({
    href,
    children,
    ...props
  }: React.ComponentPropsWithoutRef<"a">) {
    const url = String(href || "");
    const isCitation = url !== "" && urls.has(url);
    const isHighlighted = hoveredSourceUrl === url;

    // For citations, ensure we display clean domain (no protocol/www)
    let displayedContent = children;
    if (typeof children === "string") {
      if (children.startsWith("http://") || children.startsWith("https://")) {
        const domain = getDomainFromUrl(children);
        if (domain) {
          displayedContent = domain;
        } else {
          // Domain extraction failed - log for debugging, show original URL
          logger.debug("Citation domain extraction failed, showing raw URL", {
            url: children,
          });
        }
      }
    }

    if (isCitation) {
      return (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          data-citation-url={url}
          className={clsx(
            CITATION_PILL_BASE,
            isHighlighted ? CITATION_PILL_HIGHLIGHTED : CITATION_PILL_NORMAL,
          )}
          onMouseEnter={() => onCitationHover?.(url)}
          onMouseLeave={() => onCitationHover?.(null)}
          onClick={(e) => e.stopPropagation()}
          {...props}
        >
          <span className="citation-pill-text">{displayedContent}</span>
          <svg
            className="w-3 h-3 opacity-60 flex-shrink-0"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"
            />
          </svg>
        </a>
      );
    }

    // Regular link (not a citation)
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" {...props}>
        {displayedContent}
      </a>
    );
  };
}
