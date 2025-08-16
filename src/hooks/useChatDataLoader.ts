/**
 * Chat Data Loader Hook
 * Handles initial data loading and sync
 */

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import { logger } from "../lib/logger";

export function useChatDataLoader(
  repository: IChatRepository | null,
  setState: Dispatch<SetStateAction<ChatState>>,
) {
  // Load initial chats when repository is ready
  useEffect(() => {
    if (!repository) return;

    let mounted = true;

    const loadChats = async () => {
      if (!mounted) return;

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const chats = await repository.getChats();

        if (!mounted) return;

        setState((prev) => ({
          ...prev,
          chats,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
        if (!mounted) return;

        logger.error("Failed to load chats:", error);
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Failed to load chats",
        }));
      }
    };

    loadChats();

    return () => {
      mounted = false;
    };
  }, [repository, setState]);

  // Auto-select first chat if none selected
  // Note: Disabled to prevent conflicts with URL sync and route navigation
  // The chat selection should be handled by URL state sync or explicit user action
  /*
  useEffect(() => {
    if (!repository) return;

    // Check state directly to avoid re-running on setState changes
    setState((prev) => {
      // Only auto-select if we have chats but no current selection
      if (!prev.currentChatId && prev.chats.length > 0) {
        const firstChat = prev.chats[0];
        
        // Set the initial chat selection
        // Messages will be loaded separately by other hooks
        return {
          ...prev,
          currentChatId: firstChat.id,
          currentChat: firstChat,
        };
      }
      return prev;
    });
  }, [repository]); // Remove setState from deps to prevent loops
  */
}
