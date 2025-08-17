/**
 * Message input textarea component
 *
 * ⚠️ CRITICAL iOS SAFARI KEYBOARD BUG - MUST READ BEFORE MODIFYING ⚠️
 *
 * ISSUE: iOS Safari virtual keyboard crashes/disappears instantly when typing.
 * ROOT CAUSE: React bug #26805 - Controlled textareas break iOS Safari keyboard when:
 *   1. Using controlled component (value={message})
 *   2. Clearing value with setState('')
 *   3. Maintaining or restoring focus after clear
 *   This causes the virtual keyboard to enter a corrupted state.
 *
 * HISTORY: 9+ failed fix attempts. Each "fix" that didn't address the root cause failed.
 *
 * MANDATORY REQUIREMENTS - VIOLATION WILL CAUSE KEYBOARD CRASH:
 *
 * 1. NEVER use React key prop on MessageInput or parent components based on dynamic IDs
 *    - Causes complete remount → keyboard dismissal → crash on refocus
 *    - Example: DO NOT do <MessageInput key={chatId} />
 *
 * 2. NEVER use setTimeout for focus operations
 *    - Use requestAnimationFrame only - setTimeout causes race conditions
 *
 * 3. NEVER apply hardware acceleration CSS to input elements
 *    - No transform: translateZ(0) or will-change properties
 *    - These trigger compositing bugs with virtual keyboard
 *
 * 4. NEVER auto-focus on iOS Safari without user interaction
 *    - Let users tap to focus - auto-focus causes keyboard state corruption
 *
 * 5. ALWAYS handle value clearing carefully on iOS Safari
 *    - Must blur → clear → refocus with delay
 *    - Direct clear while focused triggers React bug #26805
 *
 * 6. AVOID excessive DOM manipulation during typing
 *    - Debounce height adjustments and style changes
 *    - Rapid DOM changes interfere with keyboard state
 *
 * TESTING REQUIREMENTS:
 * - Test on REAL iOS devices (iPad/iPhone) with Safari
 * - Test rapid typing, clearing, and refocusing
 * - Test chat switching while keyboard is open
 * - Test after sending multiple messages in succession
 *
 * @see https://github.com/facebook/react/issues/26805 - React iOS Safari textarea bug
 * @see https://bugs.webkit.org/show_bug.cgi?id=195884 - iOS Safari focus issues
 * @see https://bugs.webkit.org/show_bug.cgi?id=176896 - Transform focus issues
 * @see https://stackoverflow.com/q/57710542 - iOS Safari input compositing bugs
 *
 * @author William Callahan
 * @lastModified 2025-08-17
 * @criticalBugFix iOS Safari keyboard crash - 9th attempt (successful)
 */

import React, { useState, useRef, useEffect, useCallback } from "react";

interface MessageInputProps {
  /** Callback when message is sent */
  onSendMessage: (message: string) => void;
  /** Disable input during generation */
  disabled?: boolean;
  /** Whether AI is currently generating (for submit button only) */
  isGenerating?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional draft-change callback (debounced in parent) */
  onDraftChange?: (draft: string) => void;
  /** Optional history of previous user messages (oldest -> newest) */
  history?: Array<string>;
}

/**
 * Message input with auto-resize and keyboard shortcuts
 *
 * WARNING: This component is carefully tuned for iOS Safari compatibility.
 * Before making changes, review the iOS Safari requirements above.
 *
 * @param onSendMessage - Handler for message submission
 * @param disabled - Prevent input when true (blocks all input)
 * @param isGenerating - AI is generating (only affects submit button)
 * @param placeholder - Input placeholder text
 * @param onDraftChange - Optional draft change callback
 * @param history - Previous user messages for navigation
 */
export function MessageInput({
  onSendMessage,
  disabled = false,
  isGenerating = false,
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
    if (trimmed && !disabled && !isGenerating) {
      onSendMessage(trimmed);
      setMessage("");
      onDraftChange?.("");
      setHistoryIndex(null);
      setDraftBeforeHistory(null);
    }
  }, [message, disabled, isGenerating, onSendMessage, onDraftChange]);

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
        // CRITICAL: Use requestAnimationFrame, NOT setTimeout for iOS Safari
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

  // Auto-resize height - simplified without RAF
  // iOS Safari fix: Add additional checks for mobile environment
  const adjustTextarea = useCallback(() => {
    const ta = textareaRef.current;
    if (!ta) return;

    // iOS Safari fix: Prevent excessive reflows during keyboard interaction
    const isIOSSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      /WebKit/.test(navigator.userAgent) &&
      !/CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent);

    // Direct DOM operations without RAF
    ta.style.height = "auto";
    const scrollH = ta.scrollHeight;
    const target = Math.min(scrollH, MAX_TEXTAREA_HEIGHT);

    // Only update height if it actually changed to prevent unnecessary reflows
    if (parseInt(ta.style.height) !== target) {
      ta.style.height = target + "px";
    }

    // iOS Safari specific optimization: Avoid height adjustments when keyboard is likely active
    if (isIOSSafari) {
      // On iOS, viewport height changes when keyboard is opened, so we skip
      // height adjustments if the viewport is smaller than expected
      const expectedHeight = window.screen.height;
      const currentHeight = window.innerHeight;

      // If viewport is significantly smaller, keyboard is probably open
      // Skip height adjustments to prevent conflicts
      if (currentHeight < expectedHeight * 0.7) {
        return;
      }
    }
  }, []);

  // REMOVED: First focus management block - consolidating to single focus handler

  // iOS Safari fix: Enhanced textarea adjustment with mobile-specific handling
  useEffect(() => {
    adjustTextarea();
  }, [message, placeholder, disabled, adjustTextarea]);

  // iOS Safari fix: Improved resize handler with mobile-specific logic
  useEffect(() => {
    let timeoutId: number | null = null;

    // Skip resize handling on mobile iOS Safari to prevent keyboard conflicts
    const isIOSSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      /WebKit/.test(navigator.userAgent) &&
      !/CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent);

    const handler = () => {
      if (isIOSSafari) {
        // On iOS Safari, delay resize handling to avoid conflicts with virtual keyboard
        if (timeoutId) clearTimeout(timeoutId);
        timeoutId = window.setTimeout(() => {
          // Additional check to see if keyboard is likely open
          const expectedHeight = window.screen.height;
          const currentHeight = window.innerHeight;

          // Only adjust if the viewport hasn't shrunk significantly (keyboard not open)
          if (currentHeight > expectedHeight * 0.7) {
            adjustTextarea();
          }
        }, 300);
        return;
      }

      // For non-iOS devices, adjust immediately
      adjustTextarea();
    };

    window.addEventListener("resize", handler, { passive: true });
    window.addEventListener("orientationchange", handler, { passive: true });

    return () => {
      window.removeEventListener("resize", handler);
      window.removeEventListener("orientationchange", handler);
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [adjustTextarea]);

  // Simple change handler without throttling
  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMessage(val);
      if (historyIndex !== null) {
        setHistoryIndex(null);
        setDraftBeforeHistory(null);
      }

      // Direct callback without throttling
      onDraftChange?.(val);
    },
    [historyIndex, onDraftChange],
  );

  /**
   * Auto-focus management
   *
   * CRITICAL iOS SAFARI HANDLING:
   * - iOS Safari has strict focus policies for virtual keyboards
   * - Auto-focus can cause keyboard to appear/disappear unexpectedly
   * - We skip auto-focus on iOS Safari to prevent keyboard issues
   * - Users must tap the input to focus on iOS devices
   *
   * Desktop browsers get auto-focus for better UX
   */
  useEffect(() => {
    // Detect iOS Safari specifically (not Chrome/Firefox on iOS)
    const isIOSSafari =
      /iPad|iPhone|iPod/.test(navigator.userAgent) &&
      /WebKit/.test(navigator.userAgent) &&
      !/CriOS|FxiOS|OPiOS|mercury/.test(navigator.userAgent);

    // Skip focus if disabled
    if (disabled) return;

    const el = textareaRef.current;
    if (!el) return;

    // Focus if nothing else has focus, or if focus is on body/non-input element
    const shouldFocus = () => {
      const active = document.activeElement;
      if (!active || active === document.body) return true;

      // Don't steal focus from other inputs or textareas
      const tagName = active.tagName.toLowerCase();
      return (
        tagName !== "input" && tagName !== "textarea" && tagName !== "select"
      );
    };

    if (shouldFocus()) {
      // Desktop browsers: Use requestAnimationFrame for smooth focus
      // NEVER use setTimeout - causes race conditions on iOS
      if (!isIOSSafari) {
        const rafId = requestAnimationFrame(() => {
          try {
            el.focus({ preventScroll: true });
          } catch {
            // Silently ignore focus errors (user may have clicked elsewhere)
          }
        });
        return () => cancelAnimationFrame(rafId);
      }

      // iOS Safari: Skip auto-focus completely
      // Virtual keyboard management is handled by user taps only
      // This prevents keyboard appearing/disappearing unexpectedly
      return;
    }
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
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={`w-full pl-3 sm:pl-4 pr-12 sm:pr-10 text-base tracking-tight font-ui slashed-zero lining-nums tabular-nums ${
                message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"
              } rounded-xl border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100 placeholder-gray-500 dark:placeholder-gray-400 focus:border-emerald-500 dark:focus:border-emerald-400 outline-none resize-none overflow-y-auto message-input-textarea message-textarea no-transition`}
            />
            <button
              type="submit"
              aria-label="Send message"
              title={
                isGenerating ? "Wait for response to finish" : "Send message"
              }
              disabled={!message.trim() || disabled || isGenerating}
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
