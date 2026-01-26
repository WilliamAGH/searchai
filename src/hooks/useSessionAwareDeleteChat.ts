/**
 * Hook providing session-aware chat deletion
 * Encapsulates the pattern of including sessionId for anonymous user access
 */

import { useCallback } from "react";
import { useConvex } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAnonymousSession } from "./useAnonymousSession";

/**
 * Returns a mutation function that deletes a chat with the current session ID
 * This ensures anonymous users can delete their own chats
 */
export function useSessionAwareDeleteChat() {
  const convex = useConvex();
  const sessionId = useAnonymousSession();

  return useCallback(
    async (chatId: Id<"chats">) => {
      // @ts-ignore - Convex api type instantiation is excessively deep [TS1c]
      await convex.mutation(api.chats.deleteChat, {
        chatId,
        sessionId: sessionId || undefined,
      });
    },
    [convex, sessionId],
  );
}
