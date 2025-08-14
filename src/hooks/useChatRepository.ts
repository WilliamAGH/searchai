/**
 * Chat Repository Hook
 * Manages repository selection - ALWAYS uses Convex for all users
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
    // ALWAYS use Convex repository when client is available
    // This works for both authenticated and unauthenticated users
    if (convexClient) {
      return new ConvexChatRepository(convexClient, sessionId || undefined);
    }

    // Only return null if Convex is not available (should rarely happen)
    return null;
  }, [convexClient, sessionId]);

  return repository;
}
