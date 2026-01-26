/**
 * Message input textarea component
 * - Auto-resizing textarea up to 200px
 * - Enter to send, Shift+Enter for newline
 * - Mobile-optimized with proper font sizing
 * - Disabled state during generation
 */

import React, { useState, useRef, useEffect } from "react";
import { logger } from "@/lib/logger";

interface MessageInputProps {
  /** Callback when message is sent */
  onSendMessage: (message: string) => void | Promise<void>;
  /** Open share modal */
  onShare?: () => void;
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
  disabled = false,
  placeholder = "Ask me anything...",
  onDraftChange,
  history = [],
}: MessageInputProps) {
  const MAX_TEXTAREA_HEIGHT = 200;
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // (padding centering cache removed; no longer needed)
  // Track navigation through history (index into `history`), null when not navigating
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  // Preserve current draft when entering history navigation so it can be restored
  const [draftBeforeHistory, setDraftBeforeHistory] = useState<string | null>(
    null,
  );

  /**
   * Handle form submission
   * - Trims whitespace
   * - Clears input after send
   */
  const sendCurrentMessage = React.useCallback(() => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSendMessage(trimmed);
      setMessage("");
      onDraftChange?.("");
      setHistoryIndex(null);
      setDraftBeforeHistory(null);
    }
  }, [message, disabled, onSendMessage, onDraftChange]);

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

      // Ignore modifier combos
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      const ta = textareaRef.current;
      if (!ta) return;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      const atEnd =
        ta.selectionStart === message.length &&
        ta.selectionEnd === message.length;

      // Navigate up: only when caret at start
      if (e.key === "ArrowUp" && atStart && history.length > 0) {
        e.preventDefault();
        // On first entry into history mode, save current draft
        if (historyIndex === null) {
          setDraftBeforeHistory(message);
          const idx = history.length - 1;
          setHistoryIndex(idx);
          const next = history[idx] || "";
          setMessage(next);
          onDraftChange?.(next);
        } else {
          const idx = Math.max(0, historyIndex - 1);
          setHistoryIndex(idx);
          const next = history[idx] || "";
          setMessage(next);
          onDraftChange?.(next);
        }
        // Move caret to end after setting message
        requestAnimationFrame(() => {
          const el = textareaRef.current;
          if (el) {
            const len = el.value.length;
            el.setSelectionRange(len, len);
          }
        });
        return;
      }

      // Navigate down: only when caret at end
      if (e.key === "ArrowDown" && atEnd && history.length > 0) {
        if (historyIndex === null) return; // Not in history mode
        e.preventDefault();
        if (historyIndex < history.length - 1) {
          const idx = historyIndex + 1;
          setHistoryIndex(idx);
          const next = history[idx] || "";
          setMessage(next);
          onDraftChange?.(next);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
              const len = el.value.length;
              el.setSelectionRange(len, len);
            }
          });
        } else {
          // Exiting history mode -> restore draft
          const restore = draftBeforeHistory ?? "";
          setHistoryIndex(null);
          setDraftBeforeHistory(null);
          setMessage(restore);
          onDraftChange?.(restore);
          requestAnimationFrame(() => {
            const el = textareaRef.current;
            if (el) {
              const len = el.value.length;
              el.setSelectionRange(len, len);
            }
          });
        }
        return;
      }
    },
    [
      sendCurrentMessage,
      history,
      historyIndex,
      message,
      onDraftChange,
      draftBeforeHistory,
    ],
  );

  // Auto-resize height only, don't mess with padding
  const adjustTextarea = () => {
    const ta = textareaRef.current;
    if (!ta) return;

    ta.style.height = "auto";

    const style = window.getComputedStyle(ta);
    const minH = parseFloat(style.minHeight) || 0;
    const scrollH = ta.scrollHeight;
    const target = Math.min(Math.max(scrollH, minH), MAX_TEXTAREA_HEIGHT);

    ta.style.height = target + "px";
  };

  // Autofocus once and manage focus
  useEffect(() => {
    if (disabled) return;
    const el = textareaRef.current;
    if (!el) return;
    try {
      el.focus({ preventScroll: true });
    } catch (error) {
      logger.warn("MessageInput focus with preventScroll failed", { error });
      try {
        el.focus();
      } catch (fallbackError) {
        logger.warn("MessageInput focus fallback failed", {
          error: fallbackError,
        });
      }
    }
  }, [disabled]);

  // Consolidated adjustTextarea triggers: content changes, env changes, and viewport changes
  useEffect(() => {
    adjustTextarea();
  }, [message, placeholder, disabled]);
  useEffect(() => {
    const handler: EventListener = () => requestAnimationFrame(adjustTextarea);
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
    };
  }, []);

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMessage(val);
      if (historyIndex !== null) {
        setHistoryIndex(null);
        setDraftBeforeHistory(null);
      }
      onDraftChange?.(val);
    },
    [historyIndex, onDraftChange],
  );

  // Politely auto-focus the input once (desktop only, no modals)
  const hasAutoFocusedRef = useRef(false);
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (disabled) return;
    if (hasAutoFocusedRef.current) return;

    // Skip on touch-centric devices to avoid popping the keyboard
    const isCoarse =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(pointer: coarse)").matches;

    // Avoid stealing focus if something else is active or a modal is open
    const hasModalOpen = !!document.querySelector(
      '[role="dialog"][aria-modal="true"]',
    );
    const canStealFocus =
      document.activeElement === document.body &&
      document.visibilityState === "visible" &&
      !isCoarse &&
      !hasModalOpen;

    // Only focus if the element is visible and enabled
    const isVisible = el.offsetParent !== null && !el.disabled;
    if (!canStealFocus || !isVisible) return;

    const raf = requestAnimationFrame(() => {
      try {
        // Prevent scroll jumps on focus
        el.focus({ preventScroll: true });
      } catch (error) {
        logger.warn("MessageInput auto-focus with preventScroll failed", {
          error,
        });
        el.focus();
      }
    });

    hasAutoFocusedRef.current = true;
    return () => cancelAnimationFrame(raf);
  }, [disabled]);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
      <div className="p-3 sm:p-4">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
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
              className={`w-full pl-3 sm:pl-4 pr-28 text-base tracking-tight font-ui slashed-zero lining-nums tabular-nums ${
                message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"
              } rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 outline-none transition-colors resize-none overflow-y-auto overflow-x-hidden break-words whitespace-pre-wrap message-input-textarea message-textarea`}
            />
            <div className="absolute right-11 sm:right-10 top-1/2 -translate-y-1/2 h-8 flex items-center gap-1">
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
