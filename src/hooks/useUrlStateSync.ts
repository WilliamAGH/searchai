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

  // Track the last path we navigated to prevent unnecessary navigation
  const lastPathRef = React.useRef<string>(location.pathname);

  useEffect(() => {
    logger.debug("[URL_SYNC] useEffect triggered", {
      currentChatId,
      pathname: location.pathname,
      propShareId,
      propPublicId,
    });

    // Only navigate if the path has actually changed
    if (lastPathRef.current === location.pathname) {
      logger.debug("[URL_SYNC] Path unchanged, skipping navigation");
      return;
    }

    // Update the last path reference
    lastPathRef.current = location.pathname;

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
        logger.debug("[URL_SYNC] NAVIGATING TO:", expectedPath);
        navigate(expectedPath, { replace: true });
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

      logger.debug("[URL_SYNC] NAVIGATING HOME");
      navigate("/", { replace: true });
      lastPathRef.current = "/";
    }
  }, [currentChatId, location.pathname, navigate, propShareId, propPublicId]);
}
