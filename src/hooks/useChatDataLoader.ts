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

    const loadChats = async () => {
      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const chats = await repository.getChats();
        setState((prev) => ({
          ...prev,
          chats,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
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
  }, [repository, setState]);

  // Auto-select first chat if none selected
  useEffect(() => {
    setState((prev) => {
      if (!prev.currentChatId && prev.chats.length > 0 && repository) {
        const firstChat = prev.chats[0];

        // Load messages for first chat asynchronously
        repository
          .getMessages(firstChat.id)
          .then((messages) => {
            setState((current) => ({
              ...current,
              currentChatId: firstChat.id,
              currentChat: firstChat,
              messages,
            }));
          })
          .catch((error) => {
            logger.error("Failed to load messages for first chat:", error);
          });

        return {
          ...prev,
          currentChatId: firstChat.id,
          currentChat: firstChat,
        };
      }
      return prev;
    });
  }, [repository, setState]);
}
