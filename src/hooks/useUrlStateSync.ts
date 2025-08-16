import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface UseUrlStateSyncProps {
  currentChatId: string | null;
  isAuthenticated: boolean;
  // Optional context for deep links and future enhancements
  propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  chatByOpaqueId?: unknown;
  chatByShareId?: unknown;
  chatByPublicId?: unknown;
  localChats?: Array<{ id: string; shareId?: string; publicId?: string }>;
  selectChat?: (id: string) => Promise<void>;
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
  propChatId,
  propShareId,
  propPublicId,
  chatByOpaqueId: _chatByOpaqueId,
  chatByShareId: _chatByShareId,
  chatByPublicId: _chatByPublicId,
  localChats,
  selectChat,
}: UseUrlStateSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();

  // TODO: Implement full deep-link resolution using Convex query results when available.
  // For now, we use localChats to resolve and select a chat based on prop*Id values.

  // Select chat based on deep-link params if present and resolvable from local state
  useEffect(() => {
    if (!localChats || !selectChat) return;
    
    // Track if we're already selecting to prevent loops
    let shouldSelect = false;
    let targetId: string | null = null;

    // If deep-link via /s/:shareId
    if (propShareId) {
      const found = localChats.find((c) => c.shareId === propShareId);
      if (found && found.id !== currentChatId) {
        shouldSelect = true;
        targetId = found.id;
      }
    }
    // If deep-link via /p/:publicId
    else if (propPublicId) {
      const found = localChats.find((c) => c.publicId === propPublicId);
      if (found && found.id !== currentChatId) {
        shouldSelect = true;
        targetId = found.id;
      }
    }
    // If deep-link via /chat/:chatId
    else if (propChatId) {
      const found = localChats.find((c) => c.id === propChatId);
      if (found && found.id !== currentChatId) {
        shouldSelect = true;
        targetId = found.id;
      }
    }
    
    // Only select once and prevent rapid re-selections
    if (shouldSelect && targetId) {
      void selectChat(targetId);
    }
  }, [
    propShareId,
    propPublicId,
    propChatId,
    localChats,
    selectChat,
    currentChatId,
    // Remove location.pathname to prevent loops when URL changes
  ]);

  useEffect(() => {
    // Only sync if we have a chat ID and the URL doesn't already match
    // Do not override when on share/public routes
    const onShareOrPublic =
      location.pathname.startsWith("/s/") ||
      location.pathname.startsWith("/p/") ||
      !!propShareId ||
      !!propPublicId;

    if (currentChatId && !onShareOrPublic) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    } else if (
      !onShareOrPublic &&
      location.pathname !== "/" &&
      location.pathname !== "/chat"
    ) {
      // If no chat ID but we're on a chat route, go home
      navigate("/", { replace: true });
    }
  }, [currentChatId, location.pathname, navigate, propShareId, propPublicId]);
}
