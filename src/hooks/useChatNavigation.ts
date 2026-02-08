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
import { logger } from "@/lib/logger";
import type { Chat } from "@/lib/types/chat";

/** Pure path builder — no closures, no need for useCallback. */
const buildChatPath = (chatId: string): string => `/chat/${chatId}`;

interface UseChatNavigationProps {
  currentChatId: string | null;
  allChats: Chat[];
}

export function useChatNavigation({
  currentChatId,
  allChats,
}: UseChatNavigationProps) {
  const navigate = useNavigate();

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
      void navigate(buildChatPath(chatId));
    },
    [navigate],
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

  /**
   * Navigate to a chat after verifying it exists in `allChats`.
   *
   * Returns `true` if the chat was found and navigation occurred,
   * `false` if the chat doesn't exist (logged as a warning).
   *
   * Do NOT use for newly created chats — `allChats` reactive query
   * may not have updated yet. Use `navigateToChat` instead.
   */
  const navigateWithVerification = useCallback(
    (chatId: string): boolean => {
      const chatExists = allChats.some((chat) => String(chat._id) === chatId);

      if (!chatExists) {
        logger.warn(
          `navigateWithVerification: chat ${chatId} not found in allChats (${allChats.length} chats loaded)`,
        );
        return false;
      }

      void navigate(buildChatPath(chatId));
      return true;
    },
    [allChats, navigate],
  );

  const handleSelectChat = useCallback(
    (chatId: string) => {
      if (chatId !== currentChatId) {
        navigateWithVerification(chatId);
      }
    },
    [currentChatId, navigateWithVerification],
  );

  return {
    navigateToChat,
    navigateHome,
    navigateWithVerification,
    handleSelectChat,
  };
}
