/**
 * Markdown renderer with interactive citation support.
 * - Converts [domain.com] patterns to styled citation pills
 * - Handles hover highlighting between citations and sources
 */

import React from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import { useDomainToUrlMap } from "../hooks/utils/useDomainToUrlMap";
import { useCitationProcessor } from "../hooks/utils/useCitationProcessor";
import { createCitationAnchorRenderer } from "../lib/utils/citationAnchorRenderer";
import {
  REMARK_PLUGINS,
  REHYPE_PLUGINS,
  codeRenderer,
} from "../lib/utils/markdownConfig";

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
  // Create a map of domains to URLs for quick lookup
  const domainToUrlMap = useDomainToUrlMap(searchResults);

  // Convert [domain] or [URL] to markdown links where domain is known
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

  // Anchor renderer needs memoization because it depends on hover state
  const anchorRenderer = React.useMemo(
    () =>
      createCitationAnchorRenderer(
        citationUrls,
        hoveredSourceUrl,
        onCitationHover,
      ),
    [citationUrls, hoveredSourceUrl, onCitationHover],
  );

  const markdownComponents: Components = React.useMemo(
    () => ({ a: anchorRenderer, code: codeRenderer }),
    [anchorRenderer],
  );

  return (
    <div>
      <ReactMarkdown
        remarkPlugins={REMARK_PLUGINS}
        rehypePlugins={REHYPE_PLUGINS}
        components={markdownComponents}
      >
        {processedContent}
      </ReactMarkdown>
    </div>
  );
}
