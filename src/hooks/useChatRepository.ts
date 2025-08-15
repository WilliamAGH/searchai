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
import { LocalChatRepository } from "../lib/repositories/LocalChatRepository";
import { useAnonymousSession } from "./useAnonymousSession";

export function useChatRepository(): IChatRepository | null {
  const convexClient = useConvex();
  const sessionId = useAnonymousSession();

  const repository = useMemo<IChatRepository | null>(() => {
    // FIX: Restore fallback logic for reliability
    const getLocal = () => {
      // Avoid SSR and locked-down environments
      if (typeof window === "undefined") {
        console.warn(
          "Local repository unavailable server-side; returning null",
        );
        return null;
      }
      try {
        return new LocalChatRepository();
      } catch (e) {
        console.warn(
          "Local repository failed to initialize; returning null:",
          e,
        );
        return null;
      }
    };

    if (convexClient) {
      try {
        return new ConvexChatRepository(convexClient, sessionId || undefined);
      } catch (error) {
        console.warn("Convex repository failed, falling back to local:", error);
        return getLocal();
      }
    }

    return getLocal();
  }, [convexClient, sessionId]);

  return repository;
}
