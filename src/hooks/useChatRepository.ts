/**
 * Chat Repository Hook
 * Manages repository selection based on authentication status
 */

import { useMemo } from "react";
import { useConvexAuth, useConvex } from "convex/react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import { LocalChatRepository } from "../lib/repositories/LocalChatRepository";
import { ConvexChatRepository } from "../lib/repositories/ConvexChatRepository";

export function useChatRepository(): IChatRepository | null {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const convexClient = useConvex();

  const repository = useMemo<IChatRepository | null>(() => {
    if (authLoading) return null;

    if (isAuthenticated && convexClient) {
      return new ConvexChatRepository(convexClient);
    }

    return new LocalChatRepository();
  }, [isAuthenticated, authLoading, convexClient]);

  return repository;
}
