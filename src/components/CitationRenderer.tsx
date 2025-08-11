/* eslint-disable react-perf/jsx-no-new-function-as-prop */
/**
 * Interactive citation rendering component
 * - Converts [domain.com] citations to clickable links
 * - Highlights citations when source is hovered
 * - Shows external link icon on hover
 */

import React, { useState, useEffect } from "react";

interface CitationRendererProps {
  content: string;
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  hoveredSourceUrl?: string | null;
  onCitationHover?: (url: string | null) => void;
}

/**
 * Extract domain from URL
 * @param url - Full URL
 * @returns Domain without www prefix
 */
function getDomainFromUrl(url: string): string {
  try {
    const hostname = new URL(url).hostname;
    return hostname.replace("www.", "");
  } catch {
    return "";
  }
}

/**
 * Citation link component
 * - Shows domain as citation text
 * - Opens in new tab on click
 * - Shows external link icon on hover
 * - Highlights when corresponding source is hovered
 */
const CitationLink: React.FC<{
  domain: string;
  url: string;
  isHighlighted: boolean;
  onHover: (hovering: boolean) => void;
}> = ({ domain, url, isHighlighted, onHover }) => {
  const [isHovered, setIsHovered] = useState(false);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-0.5 px-1 py-0.5 ml-0.5 -mr-[2px] rounded-md text-xs font-medium
        transition-all duration-200 no-underline
        ${
          isHighlighted
            ? "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600"
            : isHovered
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
        }
      `}
      onMouseEnter={() => {
        setIsHovered(true);
        onHover(true);
      }}
      onMouseLeave={() => {
        setIsHovered(false);
        onHover(false);
      }}
      onClick={(e) => {
        e.stopPropagation(); // Prevent event bubbling
      }}
    >
      <span>{domain}</span>
      {(isHovered || isHighlighted) && (
        <svg
          className="w-3 h-3 opacity-60"
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
      )}
    </a>
  );
};

/**
 * Main citation renderer component
 * - Parses content for [domain.com] patterns
 * - Replaces with interactive citation links
 * - Manages highlighting state
 */
export function CitationRenderer({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover,
}: CitationRendererProps) {
  const [processedContent, setProcessedContent] = useState<React.ReactNode[]>(
    [],
  );

  // Create a map of domains to URLs for quick lookup
  const domainToUrlMap = React.useMemo(() => {
    const map = new Map<string, string>();
    searchResults.forEach((result) => {
      const domain = getDomainFromUrl(result.url);
      if (domain) {
        map.set(domain, result.url);
      }
    });
    return map;
  }, [searchResults]);

  // Process content to replace citations with interactive links
  useEffect(() => {
    // Regular expression to match [domain.com] patterns
    const citationRegex = /\[([^\]]+(?:\.[^\]]+)+)\]/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = citationRegex.exec(content)) !== null) {
      // Add text before the citation
      if (match.index > lastIndex) {
        parts.push(
          <span key={`text-${keyIndex++}`}>
            {content.substring(lastIndex, match.index)}
          </span>,
        );
      }

      const citedDomain = match[1];
      const matchedUrl = domainToUrlMap.get(citedDomain);

      if (matchedUrl) {
        // Found a matching source - create interactive citation
        const isHighlighted = hoveredSourceUrl === matchedUrl;

        parts.push(
          <CitationLink
            key={`citation-${keyIndex++}`}
            domain={citedDomain}
            url={matchedUrl}
            isHighlighted={isHighlighted}
            onHover={(hovering) => {
              if (onCitationHover) {
                onCitationHover(hovering ? matchedUrl : null);
              }
            }}
          />,
        );
      } else {
        // No matching source - render as plain text in brackets
        parts.push(
          <span
            key={`plain-${keyIndex++}`}
            className="text-gray-500 dark:text-gray-400"
          >
            [{citedDomain}]
          </span>,
        );
      }

      lastIndex = match.index + match[0].length;
    }

    // Add remaining text after last citation
    if (lastIndex < content.length) {
      parts.push(
        <span key={`text-${keyIndex++}`}>{content.substring(lastIndex)}</span>,
      );
    }

    // If no citations found, return content as-is
    if (parts.length === 0) {
      parts.push(<span key="content">{content}</span>);
    }

    setProcessedContent(parts);
  }, [
    content,
    searchResults,
    hoveredSourceUrl,
    domainToUrlMap,
    onCitationHover,
  ]);

  return <>{processedContent}</>;
}
