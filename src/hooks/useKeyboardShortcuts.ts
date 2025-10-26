import { useEffect, useCallback, useMemo } from "react";
import type { TouchEvent } from "react";

interface UseKeyboardShortcutsProps {
  isMobile: boolean;
  sidebarOpen: boolean;
  onToggleSidebar?: () => void;
  onNewChat: () => Promise<void>;
  onShare: () => void;
}

/**
 * Hook to manage keyboard shortcuts and interaction handlers
 * Returns handlers for swipe, sidebar toggle, new chat, and session management
 */
export function useKeyboardShortcuts({
  isMobile,
  sidebarOpen,
  onToggleSidebar,
  onNewChat,
  onShare,
}: UseKeyboardShortcutsProps) {
  // Handle keyboard shortcuts
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // Cmd/Ctrl + K - New chat
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        onNewChat();
        return;
      }

      // Cmd/Ctrl + / - Toggle sidebar
      if ((e.metaKey || e.ctrlKey) && e.key === "/") {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }

      // Cmd/Ctrl + S - Share
      if ((e.metaKey || e.ctrlKey) && e.key === "s") {
        e.preventDefault();
        onShare();
        return;
      }

      // Escape - Close sidebar on mobile
      if (e.key === "Escape" && isMobile && sidebarOpen) {
        e.preventDefault();
        onToggleSidebar?.();
        return;
      }
    },
    [isMobile, sidebarOpen, onToggleSidebar, onNewChat, onShare],
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  // Swipe handlers for mobile
  const swipeHandlers = useMemo(() => {
    if (!isMobile) return {};

    let touchStartX = 0;
    let touchEndX = 0;

    const handleTouchStart = (e: TouchEvent) => {
      touchStartX = e.touches[0].clientX;
    };

    const handleTouchEnd = (e: TouchEvent) => {
      touchEndX = e.changedTouches[0].clientX;
      const swipeDistance = touchEndX - touchStartX;

      // Swipe right to open sidebar
      if (swipeDistance > 100 && !sidebarOpen) {
        onToggleSidebar?.();
      }
      // Swipe left to close sidebar
      else if (swipeDistance < -100 && sidebarOpen) {
        onToggleSidebar?.();
      }
    };

    return {
      onTouchStart: handleTouchStart,
      onTouchEnd: handleTouchEnd,
    };
  }, [isMobile, sidebarOpen, onToggleSidebar]);

  // Handler for sidebar toggle button
  const handleToggleSidebar = useCallback(() => {
    onToggleSidebar?.();
  }, [onToggleSidebar]);

  // Handler for new chat button
  const handleNewChatButton = useCallback(async () => {
    await onNewChat();
  }, [onNewChat]);

  // Handler for starting a new chat session (clearing state)
  const startNewChatSession = useCallback(async () => {
    await onNewChat();
  }, [onNewChat]);

  return {
    swipeHandlers,
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
  };
}
