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

import { logger } from "@/lib/logger";

/**
 * Hook to sync URL state with current chat
 *
 * Ensures the browser URL matches the currently selected chat.
 * Handles navigation to /chat/:id when a chat is selected,
 * and redirects to / when no chat is selected.
 */
const resolveChatId = (chat: Doc<"chats"> | null | undefined): string | null =>
  chat?._id ? String(chat._id) : null;

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

  // Track if we are currently navigating to prevent fighting
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const isShareRoute = location.pathname.startsWith("/s/");
    const isPublicRoute = location.pathname.startsWith("/p/");
    const isChatRoute =
      location.pathname === "/" ||
      location.pathname === "/chat" ||
      location.pathname.startsWith("/chat/");

    // 1. Resolve target chat ID from URL/props/queries
    const shareChatId =
      propShareId && isShareRoute ? resolveChatId(chatByShareId) : null;
    const publicChatId =
      propPublicId && isPublicRoute ? resolveChatId(chatByPublicId) : null;
    const isOpaquePending = Boolean(
      propChatId && isChatRoute && chatByOpaqueId === undefined,
    );
    const opaqueChatId =
      propChatId && isChatRoute ? resolveChatId(chatByOpaqueId) : null;

    // Check if we are still resolving a query that is required for this route
    const isResolvingShare =
      propShareId && isShareRoute && chatByShareId === undefined;
    const isResolvingPublic =
      propPublicId && isPublicRoute && chatByPublicId === undefined;
    const isResolvingOpaque =
      propChatId && isChatRoute && chatByOpaqueId === undefined;

    const isResolving =
      isResolvingShare || isResolvingPublic || isResolvingOpaque;

    // Use isOpaquePending (not just propChatId) for fallback so that when
    // chatByOpaqueId resolves to null (missing chat), targetChatId becomes null
    // and we correctly redirect home instead of looping on a stale propChatId.
    const targetChatId =
      shareChatId ??
      publicChatId ??
      opaqueChatId ??
      (isOpaquePending ? String(propChatId) : null);

    // 2. Sync State -> URL (Priority 1: State drives URL)
    // Only enforce canonical URL if we are already synced (State == Target).
    // This prevents URL flicker: we never navigate to /chat/${currentChatId}
    // while a transition to a different target is in-flight.
    if (currentChatId && isChatRoute && currentChatId === targetChatId) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        isNavigatingRef.current = true;
        void navigate(expectedPath, { replace: true });
        queueMicrotask(() => {
          isNavigatingRef.current = false;
        });
      }
    }

    // 3. Sync URL -> State (Priority 2: URL drives State)
    // If URL implies a different chat (or no chat), update state.
    // Skip if we are still resolving the target ID from a query.
    if (currentChatId !== targetChatId && !isResolving) {
      if (
        lastResolvedChatIdRef.current !== targetChatId &&
        !isNavigatingRef.current
      ) {
        lastResolvedChatIdRef.current = targetChatId;
        void selectChat(targetChatId).catch((error) => {
          logger.error("Failed to sync chat selection:", error);
          lastResolvedChatIdRef.current = null;
        });
      }
    }

    // 4. Handle "Home" state (No chat selected)
    // If no chat ID in state AND no target in URL, ensure we are at root
    if (
      !currentChatId &&
      !targetChatId &&
      isChatRoute &&
      location.pathname !== "/"
    ) {
      isNavigatingRef.current = true;
      void navigate("/", { replace: true });
      queueMicrotask(() => {
        isNavigatingRef.current = false;
      });
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
