/**
 * Message input textarea component
 * - Auto-resizing textarea up to 200px
 * - Enter to send, Shift+Enter for newline
 * - Mobile-optimized with proper font sizing
 * - Disabled state during generation
 */

import React, { useState, useRef, useEffect } from "react";

interface MessageInputProps {
  /** Callback when message is sent */
  onSendMessage: (message: string) => void;
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
  const sendCurrentMessage = () => {
    const trimmed = message.trim();
    if (trimmed && !disabled) {
      onSendMessage(trimmed);
      setMessage("");
      onDraftChange?.("");
      setHistoryIndex(null);
      setDraftBeforeHistory(null);
    }
  };

  const handleSubmit = (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    sendCurrentMessage();
  };

  /**
   * Handle keyboard shortcuts
   * - Enter: send message
   * - Shift+Enter: newline
   */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.isComposing) return; // avoid sending mid-IME composition
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
  };

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

  /**
   * Auto-resize textarea based on content
   * - Min: 1 row; Max: 200px height
   */
  useEffect(() => {
    adjustTextarea();
  }, [message]);

  // Recalculate textarea height on orientation/viewport changes
  useEffect(() => {
    const handler = () => {
      requestAnimationFrame(() => adjustTextarea());
    };
    window.addEventListener("resize", handler);
    window.addEventListener("orientationchange", handler as any);
    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler as any);
    };
  }, []);

  // Ensure placeholder is centered on mount (before any typing)
  useEffect(() => {
    adjustTextarea();
  }, []);

  // Recenter on placeholder/disabled changes to cover empty-state transitions
  useEffect(() => {
    adjustTextarea();
  }, [placeholder, disabled]);

  // Politely auto-focus the input on mount (desktop only, no modals)
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    if (disabled) return;

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
        (el as any).focus({ preventScroll: true });
      } catch {
        el.focus();
      }
    });

    return () => cancelAnimationFrame(raf);
    // Intentionally only on mount to avoid later focus stealing
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="border-t border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 safe-bottom">
      <div className="max-w-4xl mx-auto p-3 sm:p-4">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
              ref={textareaRef}
              value={message}
              onChange={(e) => {
                const val = e.target.value;
                setMessage(val);
                // Typing exits history navigation mode
                if (historyIndex !== null) {
                  setHistoryIndex(null);
                  setDraftBeforeHistory(null);
                }
                onDraftChange?.(val);
              }}
              onKeyDown={handleKeyDown}
              placeholder={placeholder}
              aria-label="Message input"
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={`w-full pl-3 sm:pl-4 pr-16 sm:pr-14 text-base tracking-tight ${
                message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"
              } rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 focus:ring-1 focus:ring-emerald-500 dark:focus:ring-emerald-400 outline-none transition-colors resize-none overflow-y-auto message-input-textarea message-textarea`}
            />
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
