/**
 * Hook for input history navigation
 * Manages up/down arrow key navigation through previous messages
 */

import { useState, useCallback, type RefObject } from "react";

interface UseInputHistoryOptions {
  /** Array of previous user messages (oldest -> newest) */
  history: string[];
  /** Current message value */
  currentMessage: string;
  /** Callback to update the message */
  setMessage: (value: string) => void;
  /** Optional callback when message changes via history */
  onDraftChange?: (draft: string) => void;
  /** Ref to the textarea element */
  textareaRef: RefObject<HTMLTextAreaElement | null>;
}

interface UseInputHistoryReturn {
  /** Current history index (null when not navigating) */
  historyIndex: number | null;
  /** Handle arrow key navigation - returns true if handled */
  handleHistoryNavigation: (key: string, atStart: boolean, atEnd: boolean) => boolean;
  /** Reset history state */
  resetHistory: () => void;
}

/**
 * Manages history navigation for text input
 */
export function useInputHistory({
  history,
  currentMessage,
  setMessage,
  onDraftChange,
  textareaRef,
}: UseInputHistoryOptions): UseInputHistoryReturn {
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);
  const [draftBeforeHistory, setDraftBeforeHistory] = useState<string | null>(null);

  const moveCaretToEnd = useCallback(() => {
    requestAnimationFrame(() => {
      const el = textareaRef.current;
      if (el) {
        const len = el.value.length;
        el.setSelectionRange(len, len);
      }
    });
  }, [textareaRef]);

  const handleHistoryNavigation = useCallback(
    (key: string, atStart: boolean, atEnd: boolean): boolean => {
      if (history.length === 0) return false;

      // Navigate up: only when caret at start
      if (key === "ArrowUp" && atStart) {
        if (historyIndex === null) {
          // Enter history mode - save current draft
          setDraftBeforeHistory(currentMessage);
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
        moveCaretToEnd();
        return true;
      }

      // Navigate down: only when caret at end
      if (key === "ArrowDown" && atEnd && historyIndex !== null) {
        if (historyIndex < history.length - 1) {
          const idx = historyIndex + 1;
          setHistoryIndex(idx);
          const next = history[idx] || "";
          setMessage(next);
          onDraftChange?.(next);
          moveCaretToEnd();
        } else {
          // Exit history mode - restore draft
          const restore = draftBeforeHistory ?? "";
          setHistoryIndex(null);
          setDraftBeforeHistory(null);
          setMessage(restore);
          onDraftChange?.(restore);
          moveCaretToEnd();
        }
        return true;
      }

      return false;
    },
    [
      history,
      historyIndex,
      currentMessage,
      setMessage,
      onDraftChange,
      draftBeforeHistory,
      moveCaretToEnd,
    ],
  );

  const resetHistory = useCallback(() => {
    setHistoryIndex(null);
    setDraftBeforeHistory(null);
  }, []);

  return {
    historyIndex,
    handleHistoryNavigation,
    resetHistory,
  };
}
