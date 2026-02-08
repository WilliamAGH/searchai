/**
 * URL ↔ State Synchronization Hook (Single Source of Truth)
 *
 * This hook is the ONLY place that may call `selectChat()` or navigate
 * in response to a URL/state mismatch. All other code MUST go through
 * `useChatNavigation` helpers (`navigateToChat`, `navigateHome`,
 * `navigateWithVerification`) to change chat selection.
 *
 * ## State Machine (6 steps, evaluated top-to-bottom with early returns)
 *
 * 1. **Resolve**              — Derive `targetChatId` from URL params.
 * 2. **Wait**                 — Bail if any Convex query is loading.
 * 3. **URL→State (select)**   — `selectChat(targetChatId)` when URL
 *    targets a chat that differs from `currentChatId`.
 * 4. **URL→State (deselect)** — `selectChat(null)` when the pathname
 *    just changed to `/` while `currentChatId` is still set.
 * 5. **State→URL**            — Navigate to `/chat/${currentChatId}`
 *    when state changed but URL hasn't caught up.
 * 6. **Home**                 — Navigate to `/` when no chat selected.
 *
 * ## Why this ordering prevents flicker
 *
 * Step 3 returns early whenever a URL-driven transition is in-flight,
 * preventing step 5 from pushing the stale `currentChatId` into the URL.
 * Step 4 detects intentional deselection (navigateHome) by comparing
 * the current pathname against the previous render's pathname, which
 * distinguishes it from auto-selection (where pathname was already `/`).
 *
 * ## Anti-patterns — DO NOT introduce:
 *
 * - Calling `selectChat()` from any file other than this hook.
 * - Calling `setState({ currentChatId })` except inside `createChat` /
 *   `deleteChat` / `useChatDataLoader` (which cooperate with step 5).
 * - Adding a conditional early-return inside step 3 (caused the Bugbot
 *   flicker regression — the return MUST be unconditional).
 * - Gating step 5 on `currentChatId === targetChatId` (broke new-chat
 *   creation where state updates before the URL).
 * - Removing the `prevPathname` guard from step 4 (would undo auto-
 *   selection by `useChatDataLoader` on initial load).
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

  /** Tracks the previous pathname to detect intentional home navigation. */
  const prevPathnameRef = useRef(location.pathname);

  useEffect(() => {
    // Capture previous pathname before updating the ref. This lets step 4
    // distinguish "URL just changed to /" (deselection) from "URL was
    // already /" (auto-selection by useChatDataLoader).
    const prevPathname = prevPathnameRef.current;
    prevPathnameRef.current = location.pathname;

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
      if (lastResolvedChatIdRef.current !== targetChatId) {
        lastResolvedChatIdRef.current = targetChatId;
        void selectChat(targetChatId).catch((error) => {
          logger.error("Failed to sync chat selection:", error);
          lastResolvedChatIdRef.current = null;
        });
      }
      return;
    }

    // ── Step 4: URL → State (deselect) ──────────────────────────────
    // INVARIANT: When the pathname just changed to "/" while currentChatId
    // is still set, the user navigated home to deselect. Call
    // selectChat(null) to clear state. The prevPathname guard is critical:
    // without it, auto-selection by useChatDataLoader (which sets
    // currentChatId while the URL is already "/") would be immediately
    // undone.
    //
    // REGRESSION GUARD (navigateHome deselection):
    // Before this step existed, navigateHome() changed the URL to "/"
    // but step 5 (State→URL) immediately navigated back to
    // /chat/${currentChatId}, making deselection impossible.
    const pathnameChanged = prevPathname !== location.pathname;
    if (
      pathnameChanged &&
      location.pathname === "/" &&
      currentChatId &&
      !targetChatId
    ) {
      void selectChat(null).catch((error) => {
        logger.error("Failed to deselect chat:", error);
      });
      return;
    }

    // ── Step 5: State → URL ─────────────────────────────────────────
    // INVARIANT: Fires only when no URL-driven transition is pending
    // (steps 3–4 returned). Ensures the URL reflects the current chat.
    //
    // REGRESSION GUARD (new chat creation, createChat setState):
    // When createChat sets currentChatId before the URL has changed,
    // this step navigates to `/chat/${currentChatId}`. Do NOT gate this
    // on `currentChatId === targetChatId` — that breaks new-chat creation
    // where targetChatId is null (no propChatId in URL yet).
    if (currentChatId && isChatRoute) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        void navigate(expectedPath, { replace: true });
      }
      return;
    }

    // ── Step 6: Home redirect ───────────────────────────────────────
    // REGRESSION GUARD (delete current chat, navigate home):
    // When currentChatId is null and no target exists, ensure the URL
    // is at root. This handles chat deletion and explicit deselection.
    if (
      !currentChatId &&
      !targetChatId &&
      isChatRoute &&
      location.pathname !== "/"
    ) {
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
