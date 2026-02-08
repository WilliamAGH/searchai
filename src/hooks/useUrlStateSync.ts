/**
 * URL ↔ State Synchronization Hook (Single Source of Truth)
 *
 * This hook is the ONLY place that may call `selectChat()` or navigate
 * in response to a URL/state mismatch. All other code MUST go through
 * `useChatNavigation` helpers (`navigateToChat`, `navigateHome`,
 * `navigateWithVerification`) to change chat selection.
 *
 * ## State Machine (5 steps, evaluated top-to-bottom with early returns)
 *
 * 1. **Resolve** — Derive `targetChatId` from URL params + Convex queries.
 * 2. **Wait**   — If any query is still loading (`isResolving`), bail out.
 * 3. **URL→State** — If URL targets a specific chat that differs from
 *    `currentChatId`, dispatch `selectChat` and return early.
 * 4. **State→URL** — If `currentChatId` exists on a chat route but the
 *    URL doesn't match, navigate to `/chat/${currentChatId}`.
 * 5. **Home**   — If no chat and no target on a chat route, navigate `/`.
 *
 * ## Why this ordering prevents flicker
 *
 * Step 3 returns early whenever a URL-driven transition is in-flight,
 * which prevents step 4 from pushing the stale `currentChatId` into the
 * URL. Step 4 only fires when there is no pending target (targetChatId
 * is null or already matches currentChatId).
 *
 * ## Anti-patterns — DO NOT introduce:
 *
 * - Calling `selectChat()` from any file other than this hook.
 * - Calling `setState({ currentChatId })` except inside `createChat` /
 *   `deleteChat` / `useChatDataLoader` (which cooperate with step 4).
 * - Adding a conditional early-return inside step 3 (caused the Bugbot
 *   flicker regression — the return MUST be unconditional).
 * - Gating step 4 on `currentChatId === targetChatId` (broke new-chat
 *   creation where state updates before the URL).
 *
 * See `docs/contracts/navigation.md` for the full navigation contract.
 */

import { useEffect, useRef } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { logger } from "@/lib/logger";
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

  /** Prevents re-entrant navigation from causing oscillation. */
  const isNavigatingRef = useRef(false);

  useEffect(() => {
    const isShareRoute = location.pathname.startsWith("/s/");
    const isPublicRoute = location.pathname.startsWith("/p/");
    const isChatRoute =
      location.pathname === "/" ||
      location.pathname === "/chat" ||
      location.pathname.startsWith("/chat/");

    // ── Step 1: Resolve targetChatId from URL params + queries ──────
    const shareChatId =
      propShareId && isShareRoute ? resolveChatId(chatByShareId) : null;
    const publicChatId =
      propPublicId && isPublicRoute ? resolveChatId(chatByPublicId) : null;
    const opaqueChatId =
      propChatId && isChatRoute ? resolveChatId(chatByOpaqueId) : null;

    const isResolvingShare =
      propShareId && isShareRoute && chatByShareId === undefined;
    const isResolvingPublic =
      propPublicId && isPublicRoute && chatByPublicId === undefined;
    const isResolvingOpaque =
      propChatId && isChatRoute && chatByOpaqueId === undefined;

    const isResolving =
      isResolvingShare || isResolvingPublic || isResolvingOpaque;

    const targetChatId = shareChatId ?? publicChatId ?? opaqueChatId;

    // ── Step 2: Wait for pending queries ────────────────────────────
    // INVARIANT: No sync action may fire while a Convex query that
    // determines targetChatId is still loading. Doing so would use
    // stale or incomplete data and cause flicker.
    if (isResolving) {
      return;
    }

    // ── Step 3: URL → State ─────────────────────────────────────────
    // INVARIANT: When the URL requests a specific chat that differs
    // from currentChatId, dispatch selectChat and return UNCONDITIONALLY.
    // The unconditional return prevents step 4 from pushing the stale
    // currentChatId into the URL (the "Bugbot flicker" regression).
    //
    // REGRESSION GUARD (sidebar switch, opaque ID resolution):
    // If this return is made conditional, the old currentChatId will
    // briefly appear in the URL before selectChat completes.
    if (targetChatId && currentChatId !== targetChatId) {
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
      return;
    }

    // ── Step 4: State → URL ─────────────────────────────────────────
    // INVARIANT: Fires only when no URL-driven transition is pending
    // (step 3 returned). Ensures the URL reflects the current chat.
    //
    // REGRESSION GUARD (new chat creation, createChat setState):
    // When createChat sets currentChatId before the URL has changed,
    // this step navigates to `/chat/${currentChatId}`. Do NOT gate
    // this on `currentChatId === targetChatId` — that breaks new-chat
    // creation where targetChatId is null (no propChatId in URL yet).
    if (currentChatId && isChatRoute) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        isNavigatingRef.current = true;
        void navigate(expectedPath, { replace: true });
        queueMicrotask(() => {
          isNavigatingRef.current = false;
        });
      }
      return;
    }

    // ── Step 5: Home redirect ───────────────────────────────────────
    // REGRESSION GUARD (delete current chat, navigate home):
    // When currentChatId is null and no target exists, ensure the URL
    // is at root. This handles chat deletion and explicit deselection.
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
