// Refactored to use stable callbacks and props
/**
 * Interactive citation rendering component
 * - Converts [domain.com] citations to clickable links
 * - Highlights citations when source is hovered
 * - Shows external link icon on hover
 */

import React, { useState, useEffect } from "react";
import { getDomainFromUrl } from "@/lib/utils/favicon";

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
  onHoverUrl: (url: string | null) => void;
}> = ({ domain, url, isHighlighted, onHoverUrl }) => {
  const [isHovered, setIsHovered] = useState(false);
  const handleEnter = React.useCallback(() => {
    setIsHovered(true);
    onHoverUrl(url);
  }, [onHoverUrl, url]);
  const handleLeave = React.useCallback(() => {
    setIsHovered(false);
    onHoverUrl(null);
  }, [onHoverUrl]);
  const handleClick = React.useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
  }, []);

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className={`
        inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md text-xs font-medium
        transition-all duration-200 no-underline citation-pill
        ${
          isHighlighted
            ? "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600"
            : isHovered
              ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
              : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30"
        }
      `}
      onMouseEnter={handleEnter}
      onMouseLeave={handleLeave}
      onClick={handleClick}
    >
      <span className="citation-pill-text">{domain}</span>
      {(isHovered || isHighlighted) && (
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
  const [processedContent, setProcessedContent] = useState<React.ReactNode[]>([]);

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
  const noop = React.useCallback(() => {}, []);
  const hoverHandler = onCitationHover ?? noop;

  useEffect(() => {
    // Regular expression to match [domain.com] or [full URL] patterns
    const citationRegex = /\[([^\]]+)\]/g;

    const parts: React.ReactNode[] = [];
    let lastIndex = 0;
    let match;
    let keyIndex = 0;

    while ((match = citationRegex.exec(content)) !== null) {
      // Add text before the citation (trim trailing space)
      if (match.index > lastIndex) {
        const textBefore = content.substring(lastIndex, match.index);
        parts.push(<span key={`text-${keyIndex++}`}>{textBefore.replace(/\s+$/, " ")}</span>);
      }

      const citedText = match[1];
      let citedDomain = citedText;
      let matchedUrl: string | undefined;

      // Check if cited text is a full URL
      if (citedText.startsWith("http://") || citedText.startsWith("https://")) {
        // Extract domain from the full URL citation
        citedDomain = getDomainFromUrl(citedText);
        // Try to find exact URL match first
        const exactMatch = searchResults.find((r) => r.url === citedText);
        if (exactMatch) {
          matchedUrl = exactMatch.url;
        } else {
          // Fallback to domain matching
          matchedUrl = domainToUrlMap.get(citedDomain);
        }
      } else if (citedText.includes("/")) {
        // Handle cases like "github.com/user/repo" - extract just the domain
        const domainPart = citedText.split("/")[0];
        citedDomain = domainPart;
        // Look for any URL from this domain
        matchedUrl = domainToUrlMap.get(citedDomain);
        // If not found, try to find a URL that contains this path
        if (!matchedUrl) {
          const matchingResult = searchResults.find(
            (r) => r.url.includes(citedText) || getDomainFromUrl(r.url) === citedDomain,
          );
          if (matchingResult) {
            matchedUrl = matchingResult.url;
          }
        }
      } else {
        // Simple domain citation
        matchedUrl = domainToUrlMap.get(citedText);
        citedDomain = citedText;
      }

      if (matchedUrl) {
        // Found a matching source - create interactive citation
        const isHighlighted = hoveredSourceUrl === matchedUrl;

        parts.push(
          <CitationLink
            key={`citation-${keyIndex++}`}
            domain={citedDomain}
            url={matchedUrl}
            isHighlighted={isHighlighted}
            onHoverUrl={hoverHandler}
          />,
        );
      } else {
        // No matching source - skip rendering to avoid bracket artifacts
        // The unmatched citation pattern is simply removed from display
      }

      // Move lastIndex past the citation, and skip any leading whitespace
      lastIndex = match.index + match[0].length;
      // Skip one space character if present to avoid double spacing
      if (content[lastIndex] === " ") {
        lastIndex++;
      }
    }

    // Add remaining text after last citation (trim leading space)
    if (lastIndex < content.length) {
      const textAfter = content.substring(lastIndex);
      parts.push(<span key={`text-${keyIndex++}`}>{textAfter.replace(/^\s+/, " ")}</span>);
    }

    // If no citations found, return content as-is
    if (parts.length === 0) {
      parts.push(<span key="content">{content}</span>);
    }

    setProcessedContent(parts);
  }, [content, searchResults, hoveredSourceUrl, domainToUrlMap, hoverHandler]);

  return <>{processedContent}</>;
}
