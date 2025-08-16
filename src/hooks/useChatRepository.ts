/**
 * Chat Repository Hook
 * Chooses chat repository:
 * - Prefers Convex when available
 * - Returns null when initialization fails or Convex is unavailable (no Local fallback)
 */

import { useMemo } from "react";
import { useConvex } from "convex/react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import { ConvexChatRepository } from "../lib/repositories/ConvexChatRepository";
import { useAnonymousSession } from "./useAnonymousSession";
import { useAllSessionIds } from "./useAllSessionIds";

export function useChatRepository(): IChatRepository | null {
  const convexClient = useConvex();
  const sessionId = useAnonymousSession();
  const allSessionIds = useAllSessionIds();

  const repository = useMemo<IChatRepository | null>(() => {
    // Treat missing Convex URL as "service unavailable" for the UI guards.
    const convexUrl = import.meta.env.VITE_CONVEX_URL;
    if (!convexUrl) {
      console.error(
        "VITE_CONVEX_URL is not set — repository not initialized (Convex-only mode)",
      );
      return null;
    }

    if (!convexClient) {
      console.error(
        "Convex client unavailable — repository not initialized (Convex-only mode)",
      );
      return null;
    }
    try {
      return new ConvexChatRepository(
        convexClient,
        sessionId || undefined,
        allSessionIds, // Always pass the array, even if empty
      );
    } catch (error) {
      console.error("Convex repository initialization failed:", error);
      return null;
    }
  }, [convexClient, sessionId, allSessionIds]);

  return repository;
}
