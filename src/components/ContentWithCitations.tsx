/**
 * Post-processes rendered content to add interactive citations
 * - Finds [domain.com] patterns in rendered HTML
 * - Converts them to interactive citation links
 * - Handles hover highlighting
 */

import React, { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'hast-util-sanitize';
import type { Schema } from 'hast-util-sanitize';

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
    return hostname.replace('www.', '');
  } catch {
    return '';
  }
}

export function ContentWithCitations({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover
}: ContentWithCitationsProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Create a map of domains to URLs for quick lookup
  const domainToUrlMap = React.useMemo(() => {
    const map = new Map<string, string>();
    searchResults.forEach(result => {
      const domain = getDomainFromUrl(result.url);
      if (domain) {
        map.set(domain, result.url);
      }
    });
    return map;
  }, [searchResults]);

  // Process citations after content is rendered
  useEffect(() => {
    if (!containerRef.current) return;

    // Small delay to ensure React has finished rendering
    const timeoutId = setTimeout(() => {
      if (!containerRef.current) return;

      console.log('Processing citations in:', containerRef.current.textContent?.substring(0, 200));
      console.log('Domain map:', Array.from(domainToUrlMap.entries()));

      // Find all text nodes that contain [domain.com] patterns
      const citationRegex = /\[([^\]]+(?:\.[^\]]+)+)\]/g;
      const walker = document.createTreeWalker(
        containerRef.current,
        NodeFilter.SHOW_TEXT,
        null
      );

      const textNodes: Text[] = [];
      let node;
      while ((node = walker.nextNode())) {
        if (node.textContent) {
          // Reset regex for test
          citationRegex.lastIndex = 0;
          if (citationRegex.test(node.textContent)) {
            console.log('Found text node with citation:', node.textContent.substring(0, 100));
            textNodes.push(node as Text);
          }
        }
      }

      console.log('Found text nodes with citations:', textNodes.length);

    // Process each text node
    textNodes.forEach(textNode => {
      const text = textNode.textContent || '';
      const parent = textNode.parentNode;
      if (!parent) return;

      // Reset regex for each use
      citationRegex.lastIndex = 0;
      
      const fragments: (string | HTMLElement)[] = [];
      let lastIndex = 0;
      let match;

      while ((match = citationRegex.exec(text)) !== null) {
        // Add text before the citation
        if (match.index > lastIndex) {
          fragments.push(text.substring(lastIndex, match.index));
        }

        const citedDomain = match[1];
        const matchedUrl = domainToUrlMap.get(citedDomain);

        if (matchedUrl) {
          // Create citation link element
          const link = document.createElement('a');
          link.href = matchedUrl;
          link.target = '_blank';
          link.rel = 'noopener noreferrer';
          link.className = `inline-flex items-center gap-0.5 px-1 py-0.5 mx-0.5 rounded-md text-xs font-medium transition-all duration-200 no-underline align-baseline bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300`;
          link.setAttribute('data-citation-url', matchedUrl);
          
          // Add hover handlers
          link.addEventListener('mouseenter', () => {
            onCitationHover?.(matchedUrl);
            link.classList.remove('bg-gray-100', 'dark:bg-gray-800');
            link.classList.add('bg-emerald-100', 'dark:bg-emerald-900/30');
          });
          
          link.addEventListener('mouseleave', () => {
            onCitationHover?.(null);
            link.classList.remove('bg-emerald-100', 'dark:bg-emerald-900/30');
            link.classList.add('bg-gray-100', 'dark:bg-gray-800');
          });

          // Create content
          const domainSpan = document.createElement('span');
          domainSpan.textContent = citedDomain;
          link.appendChild(domainSpan);

          // Add external link icon
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'w-3 h-3 opacity-60');
          svg.setAttribute('fill', 'none');
          svg.setAttribute('stroke', 'currentColor');
          svg.setAttribute('viewBox', '0 0 24 24');
          
          const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
          path.setAttribute('stroke-linecap', 'round');
          path.setAttribute('stroke-linejoin', 'round');
          path.setAttribute('stroke-width', '2');
          path.setAttribute('d', 'M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14');
          
          svg.appendChild(path);
          link.appendChild(svg);

          fragments.push(link);
        } else {
          // No matching source - keep as plain text
          fragments.push(match[0]);
        }

        lastIndex = match.index + match[0].length;
      }

      // Add remaining text after last citation
      if (lastIndex < text.length) {
        fragments.push(text.substring(lastIndex));
      }

      // Only replace if we found citations
      if (fragments.length > 0) {
        const fragment = document.createDocumentFragment();
        fragments.forEach(item => {
          if (typeof item === 'string') {
            fragment.appendChild(document.createTextNode(item));
          } else {
            fragment.appendChild(item);
          }
        });
        parent.replaceChild(fragment, textNode);
      }
    });

    // Update citation highlighting based on hovered source
    const updateHighlighting = () => {
      const citations = containerRef.current?.querySelectorAll('a[data-citation-url]');
      citations?.forEach(citation => {
        const citationUrl = citation.getAttribute('data-citation-url');
        const link = citation as HTMLElement;
        
        if (hoveredSourceUrl && citationUrl === hoveredSourceUrl) {
          link.classList.remove('bg-gray-100', 'dark:bg-gray-800', 'bg-emerald-100', 'dark:bg-emerald-900/30');
          link.classList.add('bg-yellow-200', 'dark:bg-yellow-900/50', 'text-yellow-900', 'dark:text-yellow-200', 'ring-2', 'ring-yellow-400', 'dark:ring-yellow-600');
        } else if (!link.matches(':hover')) {
          link.classList.remove('bg-yellow-200', 'dark:bg-yellow-900/50', 'text-yellow-900', 'dark:text-yellow-200', 'ring-2', 'ring-yellow-400', 'dark:ring-yellow-600', 'bg-emerald-100', 'dark:bg-emerald-900/30');
          link.classList.add('bg-gray-100', 'dark:bg-gray-800');
        }
      });
    };

    updateHighlighting();
    }, 100); // 100ms delay to ensure React has rendered

    return () => clearTimeout(timeoutId);
  }, [content, domainToUrlMap, onCitationHover, hoveredSourceUrl]);

  // Custom sanitize schema
  const sanitizeSchema: Schema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'u',
      'table','thead','tbody','tr','th','td',
      'blockquote','hr','strong','em','del','br','p','ul','ol','li','pre','code','h1','h2','h3','h4','h5','h6'
    ],
    attributes: {
      ...defaultSchema.attributes,
      a: ['href', 'target', 'rel'],
      code: ['className']
    }
  };

  return (
    <div ref={containerRef}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
        components={{
          a: ({ ...props }) => (
            <a {...props} target="_blank" rel="noopener noreferrer" />
          ),
          code: ({ className, children, ...props }) => (
            <code className={className} {...props}>{String(children)}</code>
          )
        }}
      >
        {content}
      </ReactMarkdown>
    </div>
  );
}