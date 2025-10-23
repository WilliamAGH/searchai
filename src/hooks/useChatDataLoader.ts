/**
 * Chat Data Loader Hook
 * Handles initial data loading and sync with reactive Convex subscriptions
 */

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import { logger } from "../lib/logger";
import { IdUtils } from "../lib/types/unified";
import { useAnonymousSession } from "./useAnonymousSession";

export function useChatDataLoader(
  repository: IChatRepository | null,
  setState: Dispatch<SetStateAction<ChatState>>,
) {
  const sessionId = useAnonymousSession();

  // Use reactive Convex query for chat list (auto-updates on changes)
  const convexChats = useQuery(
    api.chats.getUserChats,
    repository ? { sessionId: sessionId || undefined } : "skip",
  );

  // Update state when Convex data changes (reactive)
  useEffect(() => {
    if (!repository || convexChats === undefined) return;

    try {
      // Convert Convex chats to unified format
      const unifiedChats = (convexChats || []).map((chat) => ({
        id: IdUtils.toUnifiedId(chat._id),
        title: chat.title,
        createdAt: chat._creationTime,
        updatedAt: chat.updatedAt || chat._creationTime,
        privacy: chat.privacy || ("private" as const),
        shareId: chat.shareId,
        publicId: chat.publicId,
        rollingSummary: chat.rollingSummary,
        source: "convex" as const,
        synced: true,
        lastSyncAt: Date.now(),
      }));

      setState((prev) => {
        const currentChat = prev.currentChatId
          ? (unifiedChats.find((chat) => chat.id === prev.currentChatId) ??
            prev.currentChat)
          : prev.currentChat;

        return {
          ...prev,
          chats: unifiedChats,
          currentChat,
          isLoading: false,
          error: null,
        };
      });
    } catch (error) {
      logger.error("Failed to process chats:", error);
      setState((prev) => ({
        ...prev,
        isLoading: false,
        error: error instanceof Error ? error.message : "Failed to load chats",
      }));
    }
  }, [convexChats, repository, setState]);

  // Auto-select first chat if none selected
  // Only runs when chats list changes AND no chat is currently selected
  useEffect(() => {
    setState((prev) => {
      // Skip if already have a chat selected or no chats available
      if (prev.currentChatId || !prev.chats.length || !repository) {
        return prev;
      }

      const firstChat = prev.chats[0];

      // Load messages for first chat asynchronously
      repository
        .getMessages(firstChat.id)
        .then((messages) => {
          setState((current) => {
            // Double-check that no chat was selected in the meantime
            if (current.currentChatId) return current;
            return {
              ...current,
              currentChatId: firstChat.id,
              currentChat: firstChat,
              messages,
            };
          });
        })
        .catch((error) => {
          logger.error("Failed to load messages for first chat:", error);
        });

      return {
        ...prev,
        currentChatId: firstChat.id,
        currentChat: firstChat,
      };
    });
  }, [repository, setState]);
}
