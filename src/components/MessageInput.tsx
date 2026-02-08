/**
 * Message input textarea component
 * - Auto-resizing textarea up to 200px
 * - Enter to send, Shift+Enter for newline
 * - Mobile-optimized with proper font sizing
 * - Disabled state during generation
 */

import React, { useState, useRef } from "react";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useMessageInputFocus } from "@/hooks/useMessageInputFocus";
import { useInputHistory } from "@/hooks/useInputHistory";

interface MessageInputProps {
  /** Callback when message is sent */
  onSendMessage: (message: string) => void | Promise<void>;
  /** Open share modal */
  onShare?: () => void;
  /** Start a new chat */
  onNewChat?: () => void;
  /** Disable input during generation */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional draft-change callback (debounced in parent) */
  onDraftChange?: (draft: string) => void;
  /** Optional history of previous user messages (oldest -> newest) */
  history?: Array<string>;
}

/**
 * Message input with auto-resize and keyboard shortcuts
 * @param onSendMessage - Handler for message submission
 * @param disabled - Prevent input when true
 * @param placeholder - Input placeholder text
 */
export function MessageInput({
  onSendMessage,
  onShare,
  onNewChat,
  disabled = false,
  placeholder = "Ask me anything...",
  onDraftChange,
  history = [],
}: MessageInputProps) {
  const MAX_TEXTAREA_HEIGHT = 200;
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const { historyIndex, handleHistoryNavigation, resetHistory } =
    useInputHistory({
      history,
      currentMessage: message,
      setMessage,
      onDraftChange,
      textareaRef,
    });

  /**
   * Handle form submission
   * - Trims whitespace
   * - Clears input after send
   */
  const sendCurrentMessage = React.useCallback(() => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      void onSendMessage(trimmed);
      setMessage("");
      onDraftChange?.("");
      resetHistory();
    }
  }, [message, disabled, onSendMessage, onDraftChange, resetHistory]);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      sendCurrentMessage();
    },
    [sendCurrentMessage],
  );

  /**
   * Handle keyboard shortcuts
   * - Enter: send message
   * - Shift+Enter: newline
   * - ArrowUp/Down: history navigation (handled by useInputHistory hook)
   */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isComposing = e.nativeEvent.isComposing ?? false;
      if (isComposing) return; // avoid sending mid-IME composition
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendCurrentMessage();
        return;
      }

      // Ignore modifier combos for history navigation
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Delegate history navigation to the hook
      const ta = textareaRef.current;
      if (!ta) return;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      const atEnd =
        ta.selectionStart === message.length &&
        ta.selectionEnd === message.length;

      if (handleHistoryNavigation(e.key, atStart, atEnd)) {
        e.preventDefault();
      }
    },
    [sendCurrentMessage, message, handleHistoryNavigation],
  );

  useAutoResizeTextarea({
    textareaRef,
    maxHeight: MAX_TEXTAREA_HEIGHT,
    dependencies: [message, placeholder, disabled],
  });
  useMessageInputFocus({ textareaRef, disabled });

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMessage(val);
      if (historyIndex !== null) {
        resetHistory();
      }
      onDraftChange?.(val);
    },
    [historyIndex, onDraftChange, resetHistory],
  );

  return (
    <div>
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
              id="message-input"
              name="message"
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label="Message input"
              data-testid="message-input"
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={`w-full pl-3 sm:pl-4 pr-36 text-base tracking-tight font-ui slashed-zero lining-nums tabular-nums ${
                message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"
              } rounded-2xl border border-gray-200/80 dark:border-gray-700/60 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-400 dark:placeholder-gray-500 shadow-sm shadow-gray-200/50 dark:shadow-black/20 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500/30 dark:focus:ring-emerald-400/30 focus:shadow-md focus:shadow-emerald-500/5 dark:focus:shadow-emerald-400/5 outline-none transition-all duration-200 resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap message-input-textarea message-textarea`}
            />
            <div className="absolute right-11 sm:right-10 top-1/2 -translate-y-1/2 h-8 flex items-center gap-1">
              <button
                type="button"
                onClick={() => onNewChat?.()}
                aria-label="New chat"
                title="New chat (⌘K)"
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
                onClick={() => navigator.clipboard.writeText(message)}
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
            <button
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={!message.trim() || disabled}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-7 sm:h-7 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
            >
              <svg
                className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
