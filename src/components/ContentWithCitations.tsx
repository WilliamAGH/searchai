// Refactored to use memoized plugins and components; no inline arrays/objects
/**
 * Adds interactive citations without DOM mutation
 * - Converts [domain.com] patterns to markdown links when domain maps to a source URL
 * - Renders anchors with hover callbacks and highlight state
 * - Avoids direct DOM manipulation to prevent React reconciliation errors
 */

import React, { useRef } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import type { PluggableList } from "unified";
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

  // Convert [domain] or [URL] to markdown links where domain is known
  const processedContent = React.useMemo(() => {
    const citationRegex = /\[([^\]]+)\]/g;
    return content.replace(citationRegex, (match, citedText) => {
      let domain = citedText;
      let url: string | undefined;

      // Check if cited text is a full URL
      if (citedText.startsWith("http://") || citedText.startsWith("https://")) {
        // Extract domain from the full URL citation
        domain = getDomainFromUrl(citedText);
        // Try to find exact URL match first
        const exactMatch = searchResults.find((r) => r.url === citedText);
        if (exactMatch) {
          url = exactMatch.url;
        } else {
          // Fallback to domain matching
          url = domainToUrlMap.get(domain);
        }
      } else if (citedText.includes("/")) {
        // Handle cases like "github.com/user/repo" - extract just the domain
        const domainPart = citedText.split("/")[0];
        domain = domainPart;

        // Try multiple matching strategies
        // 1. Exact path match
        const exactPathMatch = searchResults.find((r) =>
          r.url.includes(citedText),
        );
        if (exactPathMatch) {
          url = exactPathMatch.url;
        } else {
          // 2. Domain match from map
          url = domainToUrlMap.get(domain);
          if (!url) {
            // 3. Any URL from this domain
            const domainMatch = searchResults.find((r) => {
              const sourceDomain = getDomainFromUrl(r.url);
              return (
                sourceDomain === domain || sourceDomain === `www.${domain}`
              );
            });
            if (domainMatch) {
              url = domainMatch.url;
            }
          }
        }

        // If still no match but it looks like a valid domain, force match to first result from that domain
        if (!url && domain.includes(".")) {
          const anyMatch = searchResults.find((r) => r.url.includes(domain));
          if (anyMatch) {
            url = anyMatch.url;
          }
        }
      } else {
        // Simple domain citation - check if it looks like a domain
        if (citedText.includes(".")) {
          url = domainToUrlMap.get(citedText);
          domain = citedText;
        }
      }

      // Only convert to markdown link if we found a matching URL
      // Always show just the domain in the link text
      // Remove unmatched brackets to prevent display artifacts
      return url ? `[${domain}](${url})` : "";
    });
  }, [content, domainToUrlMap, searchResults]);

  // Custom sanitize schema (stable)
  const sanitizeSchema: Schema = React.useMemo(
    () => ({
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
    }),
    [],
  );

  const remarkPlugins: PluggableList = React.useMemo(
    () => [remarkGfm, remarkBreaks],
    [],
  );
  const rehypePlugins: PluggableList = React.useMemo(
    () => [[rehypeSanitize, sanitizeSchema]],
    [sanitizeSchema],
  );

  const anchorRenderer: NonNullable<Components["a"]> = React.useCallback(
    ({ href, children, ...props }) => {
      const url = String(href || "");
      const isCitation = url && [...domainToUrlMap.values()].includes(url);
      const highlighted = hoveredSourceUrl && url === hoveredSourceUrl;
      const baseClass =
        "inline-flex items-center gap-0.5 px-1 py-0.5 mx-1 rounded-md font-medium no-underline align-baseline transition-colors";
      const normalClass =
        "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 text-[15px] sm:text-base hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300";
      const hiClass =
        "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600 text-[15px] sm:text-base";
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
    [domainToUrlMap, hoveredSourceUrl, onCitationHover],
  );

  const codeRenderer: NonNullable<Components["code"]> = React.useCallback(
    ({ className, children, ...props }) => (
      <code className={className} {...props}>
        {String(children)}
      </code>
    ),
    [],
  );

  const markdownComponents: Components = React.useMemo(
    () => ({ a: anchorRenderer, code: codeRenderer }),
    [anchorRenderer, codeRenderer],
  );

  return (
    <div ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={remarkPlugins}
        rehypePlugins={rehypePlugins}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
