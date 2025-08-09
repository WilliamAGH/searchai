/**
 * Markdown renderer with citation support
 * - Processes markdown content
 * - Replaces [domain.com] patterns with interactive citations
 * - Handles hover highlighting between citations and sources
 */

import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkBreaks from 'remark-breaks';
import rehypeSanitize from 'rehype-sanitize';
import { defaultSchema } from 'hast-util-sanitize';
import type { Schema } from 'hast-util-sanitize';

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

export function MarkdownWithCitations({
  content,
  searchResults = [],
  hoveredSourceUrl,
  onCitationHover
}: MarkdownWithCitationsProps) {
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

  // Process content to replace citations before markdown rendering
  const processedContent = React.useMemo(() => {
    // Replace [domain.com] with custom markers that survive markdown processing
    const citationRegex = /\[([^\]]+(?:\.[^\]]+)+)\]/g;
    
    const processed = content.replace(citationRegex, (match, domain) => {
      const url = domainToUrlMap.get(domain);
      if (url) {
        // Use a special marker that won't be escaped by markdown
        return `@@CITATION@@${domain}@@${url}@@`;
      }
      return match;
    });
    return processed;
  }, [content, domainToUrlMap]);

  // Custom sanitize schema
  const sanitizeSchema: Schema = {
    ...defaultSchema,
    tagNames: [
      ...(defaultSchema.tagNames ?? []),
      'u', 'span',
      'table','thead','tbody','tr','th','td',
      'blockquote','hr','strong','em','del','br','p','ul','ol','li','pre','code','h1','h2','h3','h4','h5','h6'
    ],
    attributes: {
      ...defaultSchema.attributes,
      a: ['href', 'target', 'rel'],
      code: ['className'],
      span: ['className', 'data-url', 'data-domain']
    }
  };

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkBreaks]}
      rehypePlugins={[[rehypeSanitize, sanitizeSchema]]}
      components={{
        a: ({ _node, _inline, ...props }) => (
          <a {...props} target="_blank" rel="noopener noreferrer" />
        ),
        code: ({ _node, _inline, className, children, ...props }) => (
          <code className={className} {...props}>{String(children)}</code>
        ),
        p: ({ _node, _inline, children, ...props }) => {
          const processChildren = (children: React.ReactNode): React.ReactNode => {
            return React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                // Process citation markers in text
                const parts = child.split(/@@CITATION@@([^@]+)@@([^@]+)@@/);
                const result: React.ReactNode[] = [];
                
                for (let i = 0; i < parts.length; i++) {
                  if (i % 3 === 0) {
                    // Regular text
                    if (parts[i]) result.push(parts[i]);
                  } else if (i % 3 === 1) {
                    // Domain
                    const domain = parts[i];
                    const url = parts[i + 1];
                    const isHighlighted = hoveredSourceUrl === url;
                    
                    result.push(
                      <a
                        key={`citation-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={(() => {
                          const base = 'inline-flex items-center gap-0.5 px-1 py-0.5 mx-0.5 rounded-md text-xs font-medium transition-all duration-200 no-underline align-baseline';
                          const highlight = 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600';
                          const normal = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300';
                          return `${base} ${isHighlighted ? highlight : normal}`;
                        })()}
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
                      </a>
                    );
                    i++; // Skip the URL part as we've already processed it
                  }
                }
                
                return result.length > 0 ? result : child;
              }
              return child;
            });
          };

          return <p {...props}>{processChildren(children)}</p>;
        },
        li: ({ _node, _inline, children, ...props }) => {
          const processChildren = (children: React.ReactNode): React.ReactNode => {
            return React.Children.map(children, (child) => {
              if (typeof child === 'string') {
                // Process citation markers in text
                const parts = child.split(/@@CITATION@@([^@]+)@@([^@]+)@@/);
                const result: React.ReactNode[] = [];
                
                for (let i = 0; i < parts.length; i++) {
                  if (i % 3 === 0) {
                    // Regular text
                    if (parts[i]) result.push(parts[i]);
                  } else if (i % 3 === 1) {
                    // Domain
                    const domain = parts[i];
                    const url = parts[i + 1];
                    const isHighlighted = hoveredSourceUrl === url;
                    
                    result.push(
                      <a
                        key={`citation-${i}`}
                        href={url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={(() => {
                          const base = 'inline-flex items-center gap-0.5 px-1 py-0.5 mx-0.5 rounded-md text-xs font-medium transition-all duration-200 no-underline align-baseline';
                          const highlight = 'bg-yellow-200 dark:bg-yellow-900/50 text-yellow-900 dark:text-yellow-200 ring-2 ring-yellow-400 dark:ring-yellow-600';
                          const normal = 'bg-gray-100 dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 hover:text-emerald-700 dark:hover:text-emerald-300';
                          return `${base} ${isHighlighted ? highlight : normal}`;
                        })()}
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
                      </a>
                    );
                    i++; // Skip the URL part as we've already processed it
                  }
                }
                
                return result.length > 0 ? result : child;
              }
              return child;
            });
          };

          return <li {...props}>{processChildren(children)}</li>;
        }
      }}
    >
      {processedContent}
    </ReactMarkdown>
  );
}
