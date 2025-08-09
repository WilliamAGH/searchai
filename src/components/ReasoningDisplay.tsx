import React from 'react';

interface ReasoningDisplayProps {
  id: string;
  reasoning: string;
  isStreaming?: boolean;
  hasStartedContent?: boolean;
  collapsed: boolean;
  onToggle: (id: string) => void;
}

export function ReasoningDisplay({ 
  id,
  reasoning, 
  isStreaming = false, 
  hasStartedContent = false,
  collapsed,
  onToggle
}: ReasoningDisplayProps) {
  
  if (!reasoning) return null;

  // Get word count for display
  const wordCount = reasoning.split(/\s+/).filter(Boolean).length;

  return (
    <div className="mt-1 max-w-full overflow-hidden">
      <button
        type="button"
        onClick={() => onToggle(`reasoning-${id}`)}
        className="w-full text-left px-2 py-1 rounded bg-blue-50/50 dark:bg-blue-900/20 border border-blue-200/50 dark:border-blue-800/50 hover:bg-blue-100/50 dark:hover:bg-blue-900/30 active:bg-blue-200/50 dark:active:bg-blue-900/40 transition-colors touch-manipulation"
        aria-expanded={!collapsed ? "true" : "false"}
        aria-label="Toggle AI thinking display"
      >
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1 text-[10px] sm:text-xs text-blue-600 dark:text-blue-400 min-w-0">
            <svg className="w-2.5 h-2.5 sm:w-3 sm:h-3 flex-shrink-0 opacity-70" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
            </svg>
            <span className="font-medium opacity-80">Thinking</span>
            <span className="opacity-60">({wordCount} words)</span>
            {isStreaming && !hasStartedContent && (
              <span className="text-blue-500 dark:text-blue-400 animate-pulse font-bold">●</span>
            )}
          </div>
          <svg className={`w-2.5 h-2.5 sm:w-3 sm:h-3 text-blue-500 dark:text-blue-400 opacity-60 transition-transform flex-shrink-0 ${collapsed ? '' : 'rotate-180'}`} viewBox="0 0 24 24" fill="none" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
          </svg>
        </div>
      </button>
      {!collapsed && (
        <div className="mt-1 p-2 rounded bg-blue-50/30 dark:bg-blue-900/10 border border-blue-200/30 dark:border-blue-800/30 max-w-full overflow-hidden">
          <div className="text-[10px] sm:text-xs text-blue-700/90 dark:text-blue-300/90 font-mono leading-relaxed whitespace-pre-wrap break-words max-h-48 overflow-y-auto opacity-90">
            {reasoning}
            {isStreaming && !hasStartedContent && <span className="animate-pulse ml-0.5">▊</span>}
          </div>
        </div>
      )}
    </div>
  );
}