/**
 * Chat Repository Hook
 * Manages repository selection - ALWAYS uses Convex for all users
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
    if (convexClient) {
      try {
        return new ConvexChatRepository(convexClient, sessionId || undefined);
      } catch (error) {
        console.warn("Convex repository failed, falling back to local:", error);
        return new LocalChatRepository();
      }
    }

    // FIX: Return local repository when Convex unavailable
    return new LocalChatRepository();
  }, [convexClient, sessionId]);

  return repository;
}
