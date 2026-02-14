/**
 * Right-side toolbar action buttons for the message input area.
 * Image attach is handled separately (positioned on the left of the input).
 */

import { copyToClipboard } from "@/lib/clipboard";

interface MessageInputActionsProps {
  onNewChat?: () => void;
  onShare?: () => void;
  message: string;
  disabled: boolean;
}

export function MessageInputActions({
  onNewChat,
  onShare,
  message,
  disabled,
}: MessageInputActionsProps) {
  return (
    <div className="absolute right-11 sm:right-10 top-1/2 -translate-y-1/2 h-8 flex items-center gap-1">
      <button
        type="button"
        onClick={() => onNewChat?.()}
        aria-label="New chat"
        title="New chat"
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-emerald-600 dark:hover:text-emerald-400 transition-colors"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => onShare?.()}
        aria-label="Share chat"
        disabled={disabled}
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-60"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
      </button>
      <button
        type="button"
        onClick={() => void copyToClipboard(message)}
        aria-label="Copy message"
        disabled={disabled || !message.trim()}
        className="p-2 text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200 transition-colors disabled:opacity-60"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
      </button>
    </div>
  );
}
