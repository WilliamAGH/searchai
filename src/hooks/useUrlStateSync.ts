import React, { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { logger } from "../lib/logger";

interface UseUrlStateSyncProps {
  currentChatId: string | null;
  isAuthenticated: boolean;
  // Optional context for deep links and future enhancements
  _propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  chatByOpaqueId?: unknown;
  chatByShareId?: unknown;
  chatByPublicId?: unknown;
  _localChats?: Array<{ id: string; shareId?: string; publicId?: string }>;
  _selectChat?: (id: string) => Promise<void>;
}

/**
 * Hook to sync URL state with current chat
 * Minimal, stable behavior: keep URL in sync for /chat/:id and return to home when no selection.
 * Extra props are accepted for compatibility and future deep-link logic.
 */
export function useUrlStateSync({
  currentChatId,
  isAuthenticated: _isAuthenticated,
  // accepted but not yet acted on (compatibility with callers)
  _propChatId,
  propShareId,
  propPublicId,
  chatByOpaqueId: _chatByOpaqueId,
  chatByShareId: _chatByShareId,
  chatByPublicId: _chatByPublicId,
  _localChats,
  _selectChat,
}: UseUrlStateSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // CRITICAL FIX: Track last navigation to prevent loops
  const lastNavigationRef = React.useRef<{
    path: string;
    timestamp: number;
  } | null>(null);
  const navigationCountRef = React.useRef(0);
  const isNavigatingRef = React.useRef(false);

  // DISABLED: Selection from URL causes infinite loops
  // The route components should handle initial selection
  // This hook ONLY syncs state TO the URL, not FROM it

  useEffect(() => {
    logger.debug("[URL_SYNC] useEffect triggered", {
      currentChatId,
      pathname: location.pathname,
      propShareId,
      propPublicId,
    });

    // CRITICAL: Prevent navigation loops with aggressive checks
    const now = Date.now();

    // Prevent rapid-fire navigations (more than 10 in 1 second = loop)
    navigationCountRef.current++;
    setTimeout(() => {
      navigationCountRef.current = Math.max(0, navigationCountRef.current - 1);
    }, 1000);

    if (navigationCountRef.current > 10) {
      console.error(
        "[URL_SYNC] LOOP DETECTED! Too many navigations. Stopping.",
      );
      return;
    }

    // Don't navigate if already navigating (but clear stuck navigation after 1 second)
    if (isNavigatingRef.current) {
      const timeSinceLastNav = lastNavigationRef.current
        ? now - lastNavigationRef.current.timestamp
        : 0;

      // If navigation has been stuck for more than 1 second, clear it
      if (timeSinceLastNav > 1000) {
        console.warn("[URL_SYNC] Navigation was stuck, clearing flag");
        isNavigatingRef.current = false;
      } else {
        logger.debug(
          "[URL_SYNC] Already navigating, skipping (time since last:",
          timeSinceLastNav,
          "ms)",
        );
        return;
      }
    }

    // Don't navigate if we just navigated (within 200ms) - reduced for better UX
    if (
      lastNavigationRef.current &&
      now - lastNavigationRef.current.timestamp < 200
    ) {
      if (import.meta.env.DEV) {
        logger.debug("[URL_SYNC] Too soon after last navigation, skipping");
      }
      return;
    }

    // Only sync if we have a chat ID and the URL doesn't already match
    // Do not override when on share/public routes
    const onShareOrPublic =
      location.pathname.startsWith("/s/") ||
      location.pathname.startsWith("/p/") ||
      !!propShareId ||
      !!propPublicId;

    if (currentChatId && !onShareOrPublic) {
      const expectedPath = `/chat/${currentChatId}`;
      logger.debug("[URL_SYNC] Checking path", {
        currentPath: location.pathname,
        expectedPath,
        needsNavigation: location.pathname !== expectedPath,
      });

      if (location.pathname !== expectedPath) {
        // Prevent concurrent navigations
        isNavigatingRef.current = true;
        lastNavigationRef.current = { path: expectedPath, timestamp: now };

        logger.debug("[URL_SYNC] NAVIGATING TO:", expectedPath);

        navigate(expectedPath, { replace: true });

        // Clear navigation lock after a slightly longer delay to prevent race conditions
        setTimeout(() => {
          logger.debug("[URL_SYNC] Clearing navigation lock");
          isNavigatingRef.current = false;
        }, 200);
      }
    } else if (
      !onShareOrPublic &&
      !currentChatId &&
      location.pathname !== "/" &&
      location.pathname !== "/chat" &&
      location.pathname.startsWith("/chat/")
    ) {
      logger.debug("[URL_SYNC] No chat but on chat route, going home", {
        currentChatId,
        pathname: location.pathname,
      });

      // If no chat ID but we're on a chat route, go home
      isNavigatingRef.current = true;
      lastNavigationRef.current = { path: "/", timestamp: now };

      logger.debug("[URL_SYNC] NAVIGATING HOME");

      navigate("/", { replace: true });

      // Clear navigation lock after a slightly longer delay to prevent race conditions
      setTimeout(() => {
        logger.debug("[URL_SYNC] Clearing navigation lock (home)");
        isNavigatingRef.current = false;
      }, 200);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentChatId, location.pathname, propShareId, propPublicId]); // Navigate intentionally excluded to prevent loops
}
