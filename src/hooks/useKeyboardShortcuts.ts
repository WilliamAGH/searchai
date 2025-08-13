import { useEffect, useCallback } from "react";

interface KeyboardShortcut {
  key: string;
  ctrl?: boolean;
  alt?: boolean;
  shift?: boolean;
  meta?: boolean;
  handler: () => void;
}

/**
 * Hook to manage keyboard shortcuts
 */
export function useKeyboardShortcuts(shortcuts: KeyboardShortcut[]) {
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      for (const shortcut of shortcuts) {
        const matchesKey =
          e.key === shortcut.key ||
          e.key.toLowerCase() === shortcut.key.toLowerCase();
        const matchesCtrl = shortcut.ctrl
          ? e.ctrlKey
          : !shortcut.ctrl || !e.ctrlKey;
        const matchesAlt = shortcut.alt ? e.altKey : !shortcut.alt || !e.altKey;
        const matchesShift = shortcut.shift
          ? e.shiftKey
          : !shortcut.shift || !e.shiftKey;
        const matchesMeta = shortcut.meta
          ? e.metaKey
          : !shortcut.meta || !e.metaKey;

        if (
          matchesKey &&
          matchesCtrl &&
          matchesAlt &&
          matchesShift &&
          matchesMeta
        ) {
          e.preventDefault();
          shortcut.handler();
          break;
        }
      }
    },
    [shortcuts],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);
}
