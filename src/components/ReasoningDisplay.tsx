import React, { useState } from 'react';

interface ReasoningDisplayProps {
  reasoning: string;
  isStreaming?: boolean;
  hasStartedContent?: boolean;
}

export function ReasoningDisplay({ reasoning, isStreaming = false, hasStartedContent = false }: ReasoningDisplayProps) {
  const [isExpanded, setIsExpanded] = useState(!hasStartedContent);
  
  // Auto-collapse when content starts streaming
  React.useEffect(() => {
    if (hasStartedContent && isExpanded) {
      setIsExpanded(false);
    }
  }, [hasStartedContent, isExpanded]);
  
  if (!reasoning) return null;

  // Get preview text (first ~2 lines)
  const previewText = reasoning.split('\n').slice(0, 2).join('\n');
  const hasMoreContent = reasoning.length > previewText.length;

  return (
    <div className={`mb-4 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden bg-blue-50/50 dark:bg-blue-900/20 transition-all duration-300 ${
      hasStartedContent && !isExpanded ? 'mb-2' : ''
    }`}>
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-4 py-3 text-left flex items-center justify-between hover:bg-blue-100/50 dark:hover:bg-blue-800/30 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center">
            <svg className="w-3 h-3 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <title>Thinking</title>
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
          </div>
          <span className="text-sm font-medium text-blue-800 dark:text-blue-200">
            {hasStartedContent ? 'Thinking' : 'AI Reasoning'} {isStreaming && <span className="animate-pulse">●</span>}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {(hasMoreContent || hasStartedContent) && (
            <span className="text-xs text-blue-600 dark:text-blue-400">
              {isExpanded ? 'Hide' : 'Show thinking'}
            </span>
          )}
          <svg 
            className={`w-4 h-4 text-blue-600 dark:text-blue-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} 
            fill="none" 
            stroke="currentColor" 
            viewBox="0 0 24 24"
          >
            <title>Expand/Collapse</title>
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      
      {/* Preview when collapsed */}
      {!isExpanded && !hasStartedContent && (
        <div className="px-4 pb-3">
          <div className="text-sm text-blue-700 dark:text-blue-300 font-mono leading-relaxed">
            {previewText}
            {hasMoreContent && <span className="text-blue-500 dark:text-blue-400">...</span>}
          </div>
        </div>
      )}
      
      {/* Full content when expanded */}
      {isExpanded && (
        <div className="px-4 pb-3 border-t border-blue-200 dark:border-blue-700">
          <div className="text-sm text-blue-700 dark:text-blue-300 font-mono leading-relaxed whitespace-pre-wrap max-h-96 overflow-y-auto">
            {reasoning}
          </div>
        </div>
      )}
      
      {/* Collapsed state when content has started */}
      {!isExpanded && hasStartedContent && (
        <div className="px-4 pb-3">
          <div className="text-xs text-blue-600 dark:text-blue-400 italic">
            Thinking process available above
          </div>
        </div>
      )}
    </div>
  );
}
