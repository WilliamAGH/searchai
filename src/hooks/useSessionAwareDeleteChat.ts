/**
 * Hook providing session-aware chat deletion
 * Encapsulates the pattern of including sessionId for anonymous user access
 */

import { useCallback } from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useAnonymousSession } from "./useAnonymousSession";

/**
 * Returns a mutation function that deletes a chat with the current session ID
 * This ensures anonymous users can delete their own chats
 */
export function useSessionAwareDeleteChat() {
  const deleteChat = useMutation(api.chats.deleteChat);
  const sessionId = useAnonymousSession();

  return useCallback(
    (chatId: Id<"chats">) => {
      return deleteChat({ chatId, sessionId: sessionId || undefined });
    },
    [deleteChat, sessionId],
  );
}
