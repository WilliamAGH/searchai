import { useCallback, useRef } from "react";

interface UseSidebarTimingProps {
  sidebarOpen: boolean;
  onToggleSidebar?: () => void;
}

/**
 * Hook to manage sidebar timing and animations
 */
export function useSidebarTiming({
  sidebarOpen,
  onToggleSidebar,
}: UseSidebarTimingProps) {
  const closingTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleMobileSidebarClose = useCallback(() => {
    // Clear any existing timeout
    if (closingTimeoutRef.current) {
      clearTimeout(closingTimeoutRef.current);
      closingTimeoutRef.current = null;
    }

    // Add a small delay to allow animations to complete
    closingTimeoutRef.current = setTimeout(() => {
      onToggleSidebar?.();
      closingTimeoutRef.current = null;
    }, 150);
  }, [onToggleSidebar]);

  return {
    handleMobileSidebarClose,
    isClosing: closingTimeoutRef.current !== null,
  };
}
