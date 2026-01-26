// Refactored to use memoized plugins and components; no inline arrays/objects
/**
 * Adds interactive citations without DOM mutation
 * - Converts [domain.com] patterns to markdown links when domain maps to a source URL
 * - Renders anchors with hover callbacks and highlight state
 * - Avoids direct DOM manipulation to prevent React reconciliation errors
 */

import React, { useRef } from "react";
import { getDomainFromUrl } from "../lib/utils/favicon";
import { useDomainToUrlMap } from "../hooks/utils/useDomainToUrlMap";
import { useCitationProcessor } from "../hooks/utils/useCitationProcessor";
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

export function ContentWithCitations({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover,
}: ContentWithCitationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Create a map of domains to URLs for quick lookup
  const domainToUrlMap = useDomainToUrlMap(searchResults);

  // Convert [domain] or [URL] to markdown links where domain is known
  const processedContent = useCitationProcessor(
    content,
    searchResults,
    domainToUrlMap,
  );

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
    ({ href, children, ...props }: React.ComponentPropsWithoutRef<"a">) => {
      const url = String(href || "");
      const isCitation = url && [...domainToUrlMap.values()].includes(url);
      const highlighted = hoveredSourceUrl && url === hoveredSourceUrl;

      // Strip protocol/www from displayed text if it's a citation pill and looks like a URL
      let displayedContent = children;
      if (
        isCitation &&
        typeof children === "string" &&
        (children.startsWith("http://") || children.startsWith("https://"))
      ) {
        const domain = getDomainFromUrl(children);
        if (domain) {
          displayedContent = domain;
        }
      }

      const baseClass =
        "inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md font-medium no-underline align-baseline transition-colors citation-pill";
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
          <span className="citation-pill-text">{displayedContent}</span>
        </a>
      );
    },
    [domainToUrlMap, hoveredSourceUrl, onCitationHover],
  );

  const codeRenderer: NonNullable<Components["code"]> = React.useCallback(
    ({
      className,
      children,
      ...props
    }: React.ComponentPropsWithoutRef<"code">) => (
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
