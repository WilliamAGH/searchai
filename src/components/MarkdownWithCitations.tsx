// Refactored to use memoized plugins and components
/**
 * Markdown renderer with citation support
 * - Processes markdown content
 * - Replaces [domain.com] patterns with interactive citations
 * - Handles hover highlighting between citations and sources
 */

import React from "react";
import clsx from "clsx";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import { defaultSchema } from "hast-util-sanitize";
import type { Schema } from "hast-util-sanitize";
import type { PluggableList } from "unified";
import { getDomainFromUrl } from "../lib/utils/favicon";
import { logger } from "../lib/logger";

interface MarkdownWithCitationsProps {
  content: string;
  searchResults?: Array<{
    title: string;
    url: string;
    snippet: string;
  }>;
  hoveredSourceUrl?: string | null;
  onCitationHover?: (url: string | null) => void;
}

export function MarkdownWithCitations({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover,
}: MarkdownWithCitationsProps) {
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

  // Process content to replace citations before markdown rendering
  const processedContent = React.useMemo(() => {
    // Replace [domain.com] or [full URL] with custom markers that survive markdown processing
    const citationRegex = /\[([^\]]+)\]/g;

    const processed = content.replace(citationRegex, (match, citedText) => {
      let domain = citedText;
      let url: string | undefined;

      // Check if cited text is a full URL
      if (citedText.startsWith("http://") || citedText.startsWith("https://")) {
        // Extract domain from the full URL citation
        try {
          domain = new URL(citedText).hostname.replace("www.", "");
          // Try to find exact URL match first
          const exactMatch = searchResults?.find((r) => r.url === citedText);
          if (exactMatch) {
            url = exactMatch.url;
          } else {
            // Fallback to domain matching
            url = domainToUrlMap.get(domain);
          }
        } catch (error) {
          logger.warn("Failed to parse cited URL for markdown citation", {
            citedText,
            error,
          });
          url = domainToUrlMap.get(citedText);
        }
      } else if (citedText.includes("/")) {
        // Handle cases like "github.com/user/repo" - extract just the domain
        const domainPart = citedText.split("/")[0];
        domain = domainPart;
        // Look for any URL from this domain
        url = domainToUrlMap.get(domain);
        // If not found, try to find a URL that contains this path
        if (!url) {
          const matchingResult = searchResults?.find(
            (r) =>
              r.url.includes(citedText) ||
              (r.url.includes(domain) && r.url.includes("/")),
          );
          if (matchingResult) {
            url = matchingResult.url;
          }
        }
      } else {
        // Simple domain citation
        url = domainToUrlMap.get(citedText);
        domain = citedText;
      }

      if (url) {
        // Use a special marker that won't be escaped by markdown
        return `@@CITATION@@${domain}@@${url}@@`;
      }
      return match;
    });
    return processed;
  }, [content, domainToUrlMap, searchResults]);

  // Custom sanitize schema (stable)
  const sanitizeSchema: Schema = React.useMemo(
    () => ({
      ...defaultSchema,
      tagNames: [
        ...(defaultSchema.tagNames ?? []),
        "u",
        "span",
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
        span: ["className", "data-url", "data-domain"],
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
    ({ children, ...props }) => (
      <a {...props} target="_blank" rel="noopener noreferrer">
        {children}
      </a>
    ),
    [],
  );

  const codeRenderer: NonNullable<Components["code"]> = React.useCallback(
    ({ className, children, ...props }) => (
      <code className={className} {...props}>
        {String(children)}
      </code>
    ),
    [],
  );

  const paragraphRenderer: NonNullable<Components["p"]> = React.useCallback(
    ({ children, ...props }) => {
      const processChildren = (nodes: React.ReactNode): React.ReactNode => {
        return React.Children.map(nodes, (child) => {
          if (typeof child === "string") {
            const parts = child.split(/@@CITATION@@([^@]+)@@([^@]+)@@/);
            const result: React.ReactNode[] = [];
            for (let i = 0; i < parts.length; i++) {
              if (i % 3 === 0) {
                if (parts[i]) result.push(parts[i]);
              } else if (i % 3 === 1) {
                const domain = parts[i];
                const url = parts[i + 1];
                const isHighlighted = hoveredSourceUrl === url;
                result.push(
                  <a
                    key={`citation-${i}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "inline-flex items-center gap-0.5 px-1 py-0.5 mx-1 rounded-md text-xs font-medium transition-all duration-200 no-underline align-baseline",
                      isHighlighted
                        ? "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300",
                    )}
                    onMouseEnter={() => onCitationHover?.(url)}
                    onMouseLeave={() => onCitationHover?.(null)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{domain}</span>
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
                  </a>,
                );
                i++;
              }
            }
            return result.length > 0 ? result : child;
          }
          return child;
        });
      };
      return <p {...props}>{processChildren(children)}</p>;
    },
    [hoveredSourceUrl, onCitationHover],
  );

  const listItemRenderer: NonNullable<Components["li"]> = React.useCallback(
    ({ children, ...props }) => {
      const processChildren = (nodes: React.ReactNode): React.ReactNode => {
        return React.Children.map(nodes, (child) => {
          if (typeof child === "string") {
            const parts = child.split(/@@CITATION@@([^@]+)@@([^@]+)@@/);
            const result: React.ReactNode[] = [];
            for (let i = 0; i < parts.length; i++) {
              if (i % 3 === 0) {
                if (parts[i]) result.push(parts[i]);
              } else if (i % 3 === 1) {
                const domain = parts[i];
                const url = parts[i + 1];
                const isHighlighted = hoveredSourceUrl === url;
                result.push(
                  <a
                    key={`citation-${i}`}
                    href={url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className={clsx(
                      "inline-flex items-center gap-0.5 px-1 py-0.5 mx-1 rounded-md text-xs font-medium transition-all duration-200 no-underline align-baseline",
                      isHighlighted
                        ? "bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600"
                        : "bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300",
                    )}
                    onMouseEnter={() => onCitationHover?.(url)}
                    onMouseLeave={() => onCitationHover?.(null)}
                    onClick={(e) => e.stopPropagation()}
                  >
                    <span>{domain}</span>
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
                  </a>,
                );
                i++;
              }
            }
            return result.length > 0 ? result : child;
          }
          return child;
        });
      };
      return <li {...props}>{processChildren(children)}</li>;
    },
    [hoveredSourceUrl, onCitationHover],
  );

  const markdownComponents: Components = React.useMemo(
    () => ({
      a: anchorRenderer,
      code: codeRenderer,
      p: paragraphRenderer,
      li: listItemRenderer,
    }),
    [anchorRenderer, codeRenderer, paragraphRenderer, listItemRenderer],
  );

  return (
    <ReactMarkdown
      remarkPlugins={remarkPlugins}
      rehypePlugins={rehypePlugins}
      components={markdownComponents}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
