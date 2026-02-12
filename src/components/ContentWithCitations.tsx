/**
 * Markdown renderer with interactive citation support.
 * - Converts [domain.com] patterns to styled citation pills
 * - Handles hover highlighting between citations and sources
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import { useCitationProcessor } from "@/hooks/utils/useCitationProcessor";
import { createCitationAnchorRenderer } from "@/lib/utils/citationAnchorRenderer";
import {
  REMARK_PLUGINS,
  REHYPE_PLUGINS,
  CodeRenderer,
  TableRenderer,
} from "@/lib/utils/markdownConfig";
import { toDomainToUrlMap } from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

interface ContentWithCitationsProps {
  content: string;
  webResearchSources?: WebResearchSourceClient[] | undefined;
  hoveredSourceUrl?: string | null;
  onCitationHover?: (url: string | null) => void;
}

export function ContentWithCitations({
  content,
  webResearchSources,
  hoveredSourceUrl,
  onCitationHover,
}: ContentWithCitationsProps) {
  // Create a map of domains to URLs for quick lookup
  const domainToUrlMap = React.useMemo(
    () => toDomainToUrlMap(webResearchSources),
    [webResearchSources],
  );

  // Convert [domain] or [URL] to markdown links where domain is known
  const processedContent = useCitationProcessor(
    content,
    webResearchSources,
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

  return (
    <>
      {/*
        DO NOT REMOVE OR OVERRIDE: Overflow Protection Wrapper
        This wrapper is CRITICAL for preventing horizontal layout blowout from:
        1. Long continuous strings (URLs, base64, etc.)
        2. Wide tables
        3. Unbreakable inline code blocks
        
        - min-w-0: Allows flex child to shrink below content size
        - max-w-full: Enforces boundary respect
        - overflow-hidden: Clips any remaining rogue content
      */}
      <div className="min-w-0 max-w-full overflow-hidden">
        <ReactMarkdown
          remarkPlugins={REMARK_PLUGINS}
          rehypePlugins={REHYPE_PLUGINS}
          components={{
            a: anchorRenderer,
            code: CodeRenderer,
            table: TableRenderer,
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </>
  );
}
