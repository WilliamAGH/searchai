/**
 * Chat Repository Hook
 * Chooses chat repository:
 * - Prefers Convex when available
 * - Falls back to Local when Convex init fails or is unavailable
 */

import { useMemo } from "react";
import { useConvex } from "convex/react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import { ConvexChatRepository } from "../lib/repositories/ConvexChatRepository";
import { useAnonymousSession } from "./useAnonymousSession";

export function useChatRepository(): IChatRepository | null {
  const convexClient = useConvex();
  const sessionId = useAnonymousSession();

  const repository = useMemo<IChatRepository | null>(() => {
    if (!convexClient) {
      console.error(
        "Convex client unavailable — repository not initialized (Convex-only mode)",
      );
      return null;
    }
    try {
      return new ConvexChatRepository(convexClient, sessionId || undefined);
    } catch (error) {
      console.error("Convex repository initialization failed:", error);
      return null;
    }
  }, [convexClient, sessionId]);

  return repository;
}
