/**
 * Chat Navigation Hook — the ONLY gateway for URL-based chat selection.
 *
 * All chat selection MUST flow through the URL so that `useUrlStateSync`
 * can reconcile state from a single source of truth. Direct calls to
 * `selectChat()` or `setState({ currentChatId })` from outside
 * `useUrlStateSync` are FORBIDDEN — they create dual sources of truth
 * and cause the URL-flicker regressions this codebase has fought for
 * six months (15+ fix commits).
 *
 * **Which function to use:**
 * - `navigateToChat`  — for known-good chats (just created, or id is trusted)
 * - `navigateWithVerification` — when chat existence is uncertain (sidebar click)
 * - `navigateHome` — to deselect the current chat (replaces `selectChat(null)`)
 * - `handleSelectChat` — convenience wrapper around `navigateWithVerification`
 *
 * See `docs/contracts/navigation.md` for the full navigation contract.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Chat } from "@/lib/types/chat";

interface UseChatNavigationProps {
  currentChatId: string | null;
  allChats: Chat[];
}

export function useChatNavigation({
  currentChatId,
  allChats,
}: UseChatNavigationProps) {
  const navigate = useNavigate();

  const buildChatPath = useCallback((chatId: string) => {
    return `/chat/${chatId}`;
  }, []);

  const resolveChatId = useCallback((chat: Chat): string => {
    if (typeof chat._id === "string") {
      return chat._id;
    }

    return "";
  }, []);

  /**
   * Navigate directly to a chat without verifying existence in `allChats`.
   *
   * Use this for chats whose existence is already guaranteed (e.g. just
   * created via `createChat`). The reactive Convex query that populates
   * `allChats` may not have updated yet, so `navigateWithVerification`
   * would silently fail in that window.
   *
   * REGRESSION GUARD: `handleNewChat` MUST use this — not
   * `navigateWithVerification` — to avoid the silent-failure race.
   */
  const navigateToChat = useCallback(
    (chatId: string) => {
      void navigate(buildChatPath(String(chatId)));
    },
    [navigate, buildChatPath],
  );

  /**
   * Navigate to the home route, deselecting the current chat.
   *
   * `useUrlStateSync` step 4 detects that the pathname changed to `/`
   * and calls `selectChat(null)` to clear state. This replaces any
   * direct `chatActions.selectChat(null)` call, which would bypass the
   * URL and cause a state/URL mismatch.
   *
   * REGRESSION GUARD: `handleSelectChat(null)` and sidebar-delete flows
   * MUST use this — never `chatActions.selectChat(null)` directly.
   */
  const navigateHome = useCallback(() => {
    void navigate("/", { replace: true });
  }, [navigate]);

  const navigateWithVerification = useCallback(
    async (chatId: string) => {
      const normalizedChatId = String(chatId);
      const chatExists = allChats.some(
        (chat) => resolveChatId(chat) === normalizedChatId,
      );

      if (!chatExists) {
        return false;
      }

      // Only navigate; let useUrlStateSync handle the state update.
      // This enforces URL as the single source of truth and prevents race conditions.
      void navigate(buildChatPath(normalizedChatId));
      return true;
    },
    [allChats, navigate, buildChatPath, resolveChatId],
  );

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (chatId !== currentChatId) {
        await navigateWithVerification(chatId);
      }
    },
    [currentChatId, navigateWithVerification],
  );

  return {
    navigateToChat,
    navigateHome,
    navigateWithVerification,
    buildChatPath,
    handleSelectChat,
  };
}
