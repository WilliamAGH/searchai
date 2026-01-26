/**
 * Markdown renderer with citation support
 * - Processes markdown content
 * - Replaces [domain.com] patterns with interactive citations
 * - Handles hover highlighting between citations and sources
 */

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkBreaks from "remark-breaks";
import rehypeSanitize from "rehype-sanitize";
import type { PluggableList } from "unified";
import { useDomainToUrlMap } from "../hooks/utils/useDomainToUrlMap";
import { useCitationProcessor } from "../hooks/utils/useCitationProcessor";
import { createCitationAnchorRenderer } from "../lib/utils/citationAnchorRenderer";
import { MARKDOWN_SANITIZE_SCHEMA } from "../lib/utils/markdownSanitizeSchema";

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
  const domainToUrlMap = useDomainToUrlMap(searchResults);

  // Process content to replace citations with markdown links
  const processedContent = useCitationProcessor(
    content,
    searchResults,
    domainToUrlMap,
  );

  // Pre-compute citation URL set for O(1) lookup
  const citationUrls = React.useMemo(
    () => new Set(domainToUrlMap.values()),
    [domainToUrlMap],
  );

  const remarkPlugins: PluggableList = React.useMemo(
    () => [remarkGfm, remarkBreaks],
    [],
  );
  const rehypePlugins: PluggableList = React.useMemo(
    () => [[rehypeSanitize, MARKDOWN_SANITIZE_SCHEMA]],
    [],
  );

  // Shared citation anchor renderer handles both regular links and citation pills
  const anchorRenderer = React.useMemo(
    () =>
      createCitationAnchorRenderer(
        citationUrls,
        hoveredSourceUrl,
        onCitationHover,
      ),
    [citationUrls, hoveredSourceUrl, onCitationHover],
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
    () => ({
      a: anchorRenderer,
      code: codeRenderer,
    }),
    [anchorRenderer, codeRenderer],
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
