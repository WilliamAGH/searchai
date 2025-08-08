import React, { useEffect, useRef } from 'react';
import { SearchProgress } from './SearchProgress';
import { ReasoningDisplay } from './ReasoningDisplay';

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

export function MessageList({ 
  messages, 
  isGenerating, 
  onToggleSidebar, 
  onShare,
  currentChat,
  searchProgress 
}: MessageListProps) {
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isGenerating]);

  return (
    <div className="flex-1 overflow-y-auto">
      {messages.length === 0 ? (
        <div className="flex-1 flex items-center justify-center min-h-[60vh]">
          <div className="text-center max-w-lg px-6">
            <button
              onClick={onToggleSidebar}
              className="w-16 h-16 mx-auto mb-6 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-2xl flex items-center justify-center hover:from-emerald-600 hover:to-teal-700 transition-all duration-200 transform hover:scale-105"
              title="Toggle chat history"
            >
              <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            </button>
            <h2 className="text-3xl font-bold mb-4 text-gray-900 dark:text-white">
              Search the web with AI
            </h2>
            <p className="text-lg text-gray-600 dark:text-gray-400 leading-relaxed">
              Ask me anything and I'll search the web in real-time to give you accurate, 
              up-to-date information with sources.
            </p>
          </div>
        </div>
      ) : (
        <div className="px-6 py-8 space-y-8">
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

          {messages.map((message, index) => (
            <div key={message._id || index} className="flex gap-4">
              <div className="flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center">
                {message.role === 'user' ? (
                  <div className="w-8 h-8 bg-gray-200 dark:bg-gray-700 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-gray-600 dark:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                ) : (
                  <div className="w-8 h-8 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-full flex items-center justify-center">
                    <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                    </svg>
                  </div>
                )}
              </div>
              <div className="flex-1 min-w-0">
                {/* Show reasoning tokens for assistant messages */}
                {message.role === 'assistant' && message.reasoning && (
                  <ReasoningDisplay reasoning={message.reasoning} />
                )}
                
                <div className="prose prose-gray max-w-none dark:prose-invert prose-sm">
                  <div className="whitespace-pre-wrap text-gray-900 dark:text-gray-100 leading-relaxed">
                    {message.content}
                  </div>
                </div>
                
                {message.searchResults && message.searchResults.length > 0 && (
                  <div className="mt-4 p-4 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
                    <div className="text-sm font-medium mb-3 flex items-center justify-between text-gray-700 dark:text-gray-300">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                        </svg>
                        Sources
                      </div>
                      {message.searchMethod && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          via {message.searchMethod === 'serp' ? 'SERP' : message.searchMethod === 'openrouter' ? 'OpenRouter' : message.searchMethod}
                        </span>
                      )}
                    </div>
                    <div className="space-y-3">
                      {message.searchResults.map((result, idx) => (
                        <div key={idx} className="group">
                          <a
                            href={result.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="block p-3 rounded-lg bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-600 hover:border-emerald-300 dark:hover:border-emerald-600 transition-colors"
                          >
                            <div className="flex items-start gap-3">
                              <img 
                                src={`https://icons.duckduckgo.com/ip3/${new URL(result.url).hostname}.ico`}
                                alt=""
                                className="w-4 h-4 mt-0.5 flex-shrink-0"
                                onError={(e) => {
                                  e.currentTarget.style.display = 'none';
                                }}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="font-medium text-emerald-600 dark:text-emerald-400 group-hover:text-emerald-700 dark:group-hover:text-emerald-300 text-sm">
                                  {result.title}
                                </div>
                                <div className="text-gray-600 dark:text-gray-400 text-xs mt-1 line-clamp-2">
                                  {result.snippet}
                                </div>
                                <div className="text-gray-500 dark:text-gray-500 text-xs mt-1">
                                  {new URL(result.url).hostname}
                                </div>
                              </div>
                            </div>
                          </a>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="text-xs text-gray-500 dark:text-gray-500 mt-3">
                  {new Date(message.timestamp).toLocaleTimeString()}
                </div>
              </div>
            </div>
          ))}
          
          {isGenerating && searchProgress && (
            <SearchProgress progress={searchProgress} />
          )}
        </div>
      )}
      <div ref={messagesEndRef} />
    </div>
  );
}
