import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import type { Doc } from "../../convex/_generated/dataModel";

interface UseUrlStateSyncProps {
  currentChatId: string | null;
  propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  chatByOpaqueId?: Doc<"chats"> | null;
  chatByShareId?: Doc<"chats"> | null;
  chatByPublicId?: Doc<"chats"> | null;
  selectChat: (chatId: string | null) => Promise<void>;
}

/**
 * Hook to sync URL state with current chat
 *
 * Ensures the browser URL matches the currently selected chat.
 * Handles navigation to /chat/:id when a chat is selected,
 * and redirects to / when no chat is selected.
 */
export function useUrlStateSync({
  currentChatId,
  propChatId,
  propShareId,
  propPublicId,
  chatByOpaqueId,
  chatByShareId,
  chatByPublicId,
  selectChat,
}: UseUrlStateSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const lastResolvedChatIdRef = useRef<string | null>(null);

  const resolveChatId = (chat: Doc<"chats"> | null | undefined): string | null =>
    chat?._id ? String(chat._id) : null;

  useEffect(() => {
    const isShareRoute = location.pathname.startsWith("/s/");
    const isPublicRoute = location.pathname.startsWith("/p/");
    const isChatRoute =
      location.pathname === "/" ||
      location.pathname === "/chat" ||
      location.pathname.startsWith("/chat/");

    const shareChatId = propShareId && isShareRoute ? resolveChatId(chatByShareId) : null;
    const publicChatId = propPublicId && isPublicRoute ? resolveChatId(chatByPublicId) : null;
    const opaqueChatId = propChatId && isChatRoute ? resolveChatId(chatByOpaqueId) : null;

    const targetChatId =
      shareChatId ??
      publicChatId ??
      opaqueChatId ??
      (propChatId && isChatRoute ? String(propChatId) : null);

    if (targetChatId && currentChatId !== targetChatId) {
      if (lastResolvedChatIdRef.current !== targetChatId) {
        lastResolvedChatIdRef.current = targetChatId;
        void selectChat(targetChatId).catch(() => {
          lastResolvedChatIdRef.current = null;
        });
      }
    }

    // Only sync if we're already on a chat route and the URL doesn't match
    if (currentChatId && isChatRoute) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        void navigate(expectedPath, { replace: true });
      }
      return;
    }

    // If no chat ID but we're on a chat route, go home
    if (!currentChatId && isChatRoute && location.pathname !== "/") {
      void navigate("/", { replace: true });
    }
  }, [
    currentChatId,
    propChatId,
    propShareId,
    propPublicId,
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
    location.pathname,
    navigate,
    selectChat,
  ]);
}
