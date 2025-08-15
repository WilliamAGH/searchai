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

export function useChatRepository(): IChatRepository | null {
  const convexClient = useConvex();
  const sessionId = useAnonymousSession();

  const repository = useMemo<IChatRepository | null>(() => {
    // Treat missing Convex URL as "service unavailable" for the UI guards.
    const metaEnv = (import.meta as { env?: Record<string, unknown> })?.env;
    const convexUrl = metaEnv?.VITE_CONVEX_URL as string | undefined;
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
      return new ConvexChatRepository(convexClient, sessionId || undefined);
    } catch (error) {
      console.error("Convex repository initialization failed:", error);
      return null;
    }
  }, [convexClient, sessionId]);

  return repository;
}
