/**
 * Message list display component
 * - Auto-scrolls to bottom unless user scrolls up
 * - Collapses sources/reasoning based on stream state
 * - Renders markdown with sanitization
 * - Shows scroll-to-bottom FAB when scrolled up
 */

import React, { useEffect, useRef } from 'react';
import { SearchProgress } from './SearchProgress';
import { ReasoningDisplay } from './ReasoningDisplay';
import { ContentWithCitations } from './ContentWithCitations';

/**
 * Extract hostname from URL safely
 * - Handles malformed URLs
 * - Falls back to empty string
 */
function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    try {
      return new URL(`https://${url}`).hostname;
    } catch {
      return '';
    }
  }
}

/**
 * Get favicon URL from DuckDuckGo service
 * - Returns null if hostname invalid
 * - Uses DDG icon proxy service
 */
function getFaviconUrl(url: string): string | null {
  const hostname = getSafeHostname(url);
  if (!hostname) return null;
  return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}

interface SearchResult {
  title: string;
  url: string;
  snippet: string;
  relevanceScore?: number;
}

interface Message {
  _id?: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
  searchResults?: SearchResult[];
  sources?: string[];
  reasoning?: string;
  searchMethod?: 'serp' | 'openrouter' | 'duckduckgo' | 'fallback';
  hasRealResults?: boolean;
  isStreaming?: boolean;
  hasStartedContent?: boolean;
}

interface Chat {
  _id: string;
  title: string;
  shareId?: string;
  isShared?: boolean;
  isPublic?: boolean;
}

interface MessageListProps {
  messages: Message[];
  isGenerating: boolean;
  onToggleSidebar: () => void;
  onShare?: () => void;
  currentChat?: Chat;
  searchProgress?: {
    stage: 'searching' | 'scraping' | 'analyzing' | 'generating';
    message: string;
    urls?: string[];
    currentUrl?: string;
  } | null;
}

/**
 * Main message list component
 * @param messages - Array of chat messages
 * @param isGenerating - AI currently generating response
 * @param onToggleSidebar - Toggle sidebar callback
 * @param onShare - Share conversation callback
 * @param currentChat - Current chat metadata
 * @param searchProgress - Search progress indicator
 */
export function MessageList({ 
  messages, 
  isGenerating, 
  onToggleSidebar, 
  onShare,
  currentChat,
  searchProgress 
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [collapsedById, setCollapsedById] = React.useState<Record<string, boolean>>({});
  const [userHasScrolled, setUserHasScrolled] = React.useState(false);
  const [hoveredSourceUrl, setHoveredSourceUrl] = React.useState<string | null>(null);
  const [hoveredCitationUrl, setHoveredCitationUrl] = React.useState<string | null>(null);

  /**
   * Scroll to bottom of messages
   * - Uses smooth scroll behavior
   * - Targets sentinel element
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only auto-scroll if user hasn't manually scrolled up
  useEffect(() => {
    if (!userHasScrolled) {
      scrollToBottom();
    }
  }, [messages, isGenerating, userHasScrolled]);

  // Detect when user scrolls manually
  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      // Check if user has scrolled up from the bottom (with 50px threshold)
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 50;
      setUserHasScrolled(!isAtBottom);
    };

    container.addEventListener('scroll', handleScroll);
    return () => container.removeEventListener('scroll', handleScroll);
  }, []);

  // Auto-collapse sources when thinking begins, keep reasoning visible until content starts
  useEffect(() => {
    setCollapsedById(prev => {
      const updates: Record<string, boolean> = {};
      
      messages.forEach((m, index) => {
        const id = m._id || String(index);
        if (!id || m.role !== 'assistant') return;
        
        // Check if this message has reasoning or content or is streaming
        const hasReasoning = Boolean(m.reasoning && m.reasoning.trim());
        const hasContent = Boolean(m.content && m.content.trim());
        const isStreaming = Boolean(m.isStreaming);
        
        // Sources should collapse immediately when streaming begins (AI starts responding)
        if (m.searchResults && m.searchResults.length > 0) {
          const sourceId = id;
          // Only set if not already manually toggled by user
          if (prev[sourceId] === undefined) {
            // Collapse sources when streaming starts OR reasoning OR content exists
            updates[sourceId] = isStreaming || hasReasoning || hasContent;
          }
        }
        
        // Reasoning should only collapse when actual content starts
        if (hasReasoning) {
          const reasoningId = `reasoning-${id}`;
          // Only set if not already manually toggled by user
          if (prev[reasoningId] === undefined) {
            // Keep reasoning expanded until content appears
            updates[reasoningId] = hasContent;
          }
        }
      });
      
      // Only update if there are changes
      if (Object.keys(updates).length > 0) {
        return { ...prev, ...updates };
      }
      return prev;
    });
  }, [messages]); // Remove collapsedById from deps to prevent loops

  /**
   * Toggle collapsed state for element
   * @param id - Element ID to toggle
   */
  const toggleCollapsed = (id: string) => {
    setCollapsedById(prev => ({ ...prev, [id]: !prev[id] }));
  };
  
  /**
   * Compact sources component
   * - Shows collapsed summary by default
   * - Expands to show all sources on click
   * - Displays favicons and snippets
   */
  const CompactSources: React.FC<{ id: string; results: SearchResult[]; method?: Message['searchMethod'] }>
    = ({ id, results, method }) => {
    // Always collapsed by default, only expanded if manually clicked
    const collapsed = collapsedById[id] ?? true;
    const hostnames = results.map(r => getSafeHostname(r.url) || r.url).filter(Boolean);
    const summary = hostnames.slice(0, 3).join(' · ');

    return (
      <div className="mt-3 max-w-full overflow-hidden">
        <button
          type="button"
          onClick={() => toggleCollapsed(id)}
          className="w-full text-left px-2 sm:px-3 py-2 rounded-lg bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 hover:bg-gray-100 dark:hover:bg-gray-700 active:bg-gray-200 dark:active:bg-gray-600 transition-colors touch-manipulation"
          aria-expanded={!collapsed ? "true" : "false"}
          aria-label="Toggle sources display"
        >
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-1 sm:gap-2 text-xs sm:text-sm text-gray-700 dark:text-gray-300 min-w-0">
              <svg className="w-3 h-3 sm:w-4 sm:h-4 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
              <span className="font-medium">Sources</span>
              <span className="text-gray-500 dark:text-gray-400">({results.length})</span>
              {method && (
                <span className="hidden sm:inline text-xs text-gray-500 dark:text-gray-400 truncate">via {method === 'serp' ? 'SERP' : method}</span>
              )}
            </div>
            <svg className={`w-3 h-3 sm:w-4 sm:h-4 text-gray-500 dark:text-gray-400 transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </div>
          {collapsed && summary && (
            <div className="mt-1 text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 truncate">
              {summary}{hostnames.length > 3 ? ' …' : ''}
            </div>
          )}
        </button>
        {!collapsed && (
          <div className="mt-2 space-y-1 sm:space-y-2 max-w-full overflow-hidden">
            {results.map((result, idx) => (
              <a 
                key={idx} 
                href={result.url} 
                target="_blank" 
                rel="noopener noreferrer"
                className={`block p-2 rounded-lg bg-white dark:bg-gray-800 border transition-all duration-200 touch-manipulation overflow-hidden ${
                  hoveredCitationUrl === result.url 
                    ? 'border-yellow-400 dark:border-yellow-600 bg-yellow-50 dark:bg-yellow-900/20 ring-2 ring-yellow-400 dark:ring-yellow-600'
                    : 'border-gray-200 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-600 active:border-emerald-400 dark:active:border-emerald-500'
                }`}
                onMouseEnter={() => setHoveredSourceUrl(result.url)}
                onMouseLeave={() => setHoveredSourceUrl(null)}
              >
                <div className="flex items-start gap-2 max-w-full">
                  {getFaviconUrl(result.url) ? (
                    <img
                      src={getFaviconUrl(result.url) as string}
                      alt="Website favicon"
                      width={14}
                      height={14}
                      className="w-3 h-3 sm:w-3.5 sm:h-3.5 mt-0.5 flex-shrink-0 object-contain rounded-sm"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                    />
                  ) : null}
                  <div className="flex-1 min-w-0 overflow-hidden">
                    <div className="text-xs sm:text-sm text-emerald-600 dark:text-emerald-400 truncate">{result.title}</div>
                    <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400 line-clamp-2 break-words">{result.snippet}</div>
                    <div className="text-[10px] sm:text-[11px] text-gray-500 dark:text-gray-500 truncate">{getSafeHostname(result.url) || result.url}</div>
                  </div>
                </div>
              </a>
            ))}
          </div>
        )}
      </div>
    );
  };

  return (
    <div ref={scrollContainerRef} className="flex-1 overflow-y-auto relative">
      {/* Scroll to bottom button */}
      {userHasScrolled && messages.length > 0 && (
        <button
          onClick={() => {
            scrollToBottom();
            setUserHasScrolled(false);
          }}
          className="fixed bottom-20 right-4 z-10 p-3 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full shadow-lg transition-all transform hover:scale-105"
          aria-label="Scroll to bottom"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
          </svg>
        </button>
      )}
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-sm sm:max-w-lg px-4 sm:px-6">
            <button
              onClick={onToggleSidebar}
              className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 transform hover:scale-105"
              title="Toggle chat history"
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <h2 className="text-2xl sm:text-3xl font-bold mb-3 sm:mb-4 text-gray-900 dark:text-white">
              Search the web with AI
            </h2>
            <p className="text-base sm:text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
              Ask me anything and I'll search the web in real-time to give you accurate, 
              up-to-date information with sources.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-4 sm:px-6 py-6 sm:py-8 space-y-6 sm:space-y-8">
          {/* Share button - only show if there are messages and onShare is provided */}
          {messages.length > 0 && onShare && (
            <div className="flex justify-end mb-4">
              <button
                onClick={onShare}
                className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors text-gray-700 dark:text-gray-300"
                title="Share this conversation"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z" />
                </svg>
                {currentChat?.isShared ? 'Shared' : 'Share'}
              </button>
            </div>
          )}

             {messages.map((message, index) => {
             const safeTimestamp = typeof message.timestamp === 'number' ? message.timestamp : Date.now();
             const safeResults = Array.isArray(message.searchResults)
               ? message.searchResults.filter(
                   (r) => r && typeof r.url === 'string' && typeof r.title === 'string'
                 )
               : [];
             
             return (
            <div key={message._id || index} className="flex gap-2 sm:gap-4 max-w-full overflow-hidden">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                {message.role === 'user' ? (
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="User">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-label="Assistant">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                {/* 1) Sources (compact/collapsed) first */}
                {message.role === 'assistant' && safeResults.length > 0 && (
                  <CompactSources id={message._id || String(index)} results={safeResults} method={message.searchMethod} />
                )}

                {/* 2) Reasoning / thinking - positioned below sources */}
                {message.role === 'assistant' && message.reasoning && message.reasoning.trim() && (
                  <ReasoningDisplay 
                    id={message._id || String(index)}
                    reasoning={message.reasoning}
                    isStreaming={message.isStreaming}
                    hasStartedContent={message.hasStartedContent}
                    collapsed={collapsedById[`reasoning-${message._id || String(index)}`] ?? false}
                    onToggle={toggleCollapsed}
                  />
                )}

                {/* 4) AI/user content last – always appears under sources/thinking */}
                <div className="prose prose-gray max-w-none dark:prose-invert prose-sm mt-2 overflow-x-hidden">
                  {message.role === 'assistant' ? (
                    <ContentWithCitations
                      content={message.content || ""}
                      searchResults={safeResults}
                      hoveredSourceUrl={hoveredSourceUrl}
                      onCitationHover={setHoveredCitationUrl}
                    />

                  ) : (
                    <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed break-words">
                      {message.content}
                    </div>
                  )}
                </div>
                
                 <div className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                   {new Date(safeTimestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
           )})}
          
          {/* Show "AI is thinking" when in generating stage */}
          {isGenerating && searchProgress && searchProgress.stage === 'generating' && (
            <div className="flex gap-2 sm:gap-4">
              <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                </svg>
              </div>
              <div className="flex-1">
                <div className="text-sm text-gray-600 dark:text-gray-400 flex items-center gap-2">
                  <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                  </svg>
                  <span>AI is thinking and generating response...</span>
                  <div className="flex space-x-1">
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:0ms]"></div>
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:100ms]"></div>
                    <div className="w-1 h-1 bg-emerald-500 rounded-full animate-bounce [animation-delay:200ms]"></div>
                  </div>
                </div>
              </div>
            </div>
          )}
          
          {/* Show search progress for non-generating stages */}
          {isGenerating && searchProgress && searchProgress.stage !== 'generating' && (
            <SearchProgress progress={searchProgress} />
          )}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
