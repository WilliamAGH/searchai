/**
 * Adds interactive citations without DOM mutation
 * - Converts [domain.com] patterns to markdown links when domain maps to a source URL
 * - Renders anchors with hover callbacks and highlight state
 * - Avoids direct DOM manipulation to prevent React reconciliation errors
 */

import React, { useRef } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import type { Schema } from "hast-util-sanitize";

interface ContentWithCitationsProps {
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

export function ContentWithCitations({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover,
}: ContentWithCitationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

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

  // Convert [domain] to markdown links where domain is known
  const processedContent = React.useMemo(() => {
    const citationRegex = /\[([^\]]+(?:\.[^\]]+)+)\]/g;
    return content.replace(citationRegex, (match, p1) => {
      const citedDomain = String(p1);
      const url = domainToUrlMap.get(citedDomain);
      return url ? `[${citedDomain}](${url})` : match;
    });
  }, [content, domainToUrlMap]);

  // Custom sanitize schema
  const sanitizeSchema: Schema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      "u",
      "table",
      "thead",
      "tbody",
      "tr",
      "th",
      "td",
      "blockquote",
      "hr",
      "strong",
      "em",
      "del",
      "br",
      "p",
      "ul",
      "ol",
      "li",
      "pre",
      "code",
      "h1",
      "h2",
      "h3",
      "h4",
      "h5",
      "h6",
    ],
    attributes: {
      ...defaultSchema.attributes,
      a: ["href", "target", "rel"],
      code: ["className"],
    },
  };

  return (
    <div ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ href, children, ...props }) => {
            const url = String(href || "");
            const isCitation =
              url && [...domainToUrlMap.values()].includes(url);
            const highlighted = hoveredSourceUrl && url === hoveredSourceUrl;
            const baseClass =
              "inline-flex items-center gap-0.5 px-1 py-0.5 ml-0.5 -mr-[2px] rounded-md text-xs font-medium no-underline align-baseline transition-colors";
            const normalClass =
              "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300";
            const hiClass =
              "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600";
            return (
              <a
                href={url}
                target="_blank"
                rel="noopener noreferrer"
                data-citation-url={isCitation ? url : undefined}
                className={`${baseClass} ${highlighted ? hiClass : normalClass}`}
                onMouseEnter={() => isCitation && onCitationHover?.(url)}
                onMouseLeave={() => isCitation && onCitationHover?.(null)}
                {...props}
              >
                {children}
              </a>
            );
          },
          code: ({ className, children, ...props }) => (
            <code className={className} {...props}>
              {String(children)}
            </code>
          ),
        }}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
