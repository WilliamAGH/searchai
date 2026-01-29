/**
 * ReasoningDisplay component
 * Shows the AI's thinking/reasoning process during generation
 */

interface ReasoningDisplayProps {
  /** The reasoning text to display */
  reasoning: string;
}

/**
 * Displays the AI's internal reasoning/thinking process
 * with a distinctive purple theme to differentiate from regular content
 */
export function ReasoningDisplay({ reasoning }: ReasoningDisplayProps) {
  return (
    <div className="flex gap-2 sm:gap-4">
      <div className="flex-shrink-0 w-8 h-8 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-full flex items-center justify-center">
        <svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z"
          />
        </svg>
      </div>
      <div className="flex-1 min-w-0">
        <div className="bg-purple-50 dark:bg-purple-900/20 rounded-xl p-4 border border-purple-200 dark:border-purple-700">
          <div className="text-sm font-medium text-purple-700 dark:text-purple-300 mb-2 flex items-center gap-2">
            <span>Thinking process</span>
          </div>
          <div className="text-xs text-purple-600 dark:text-purple-400 whitespace-pre-wrap font-mono">
            {reasoning}
          </div>
        </div>
      </div>
    </div>
  );
}
