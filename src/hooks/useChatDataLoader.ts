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
import { getErrorMessage } from "../lib/utils/errorUtils";
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
        isLocal: false,
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
        error: getErrorMessage(error, "Failed to load chats"),
      }));
    }
  }, [convexChats, repository, setState]);

  // Auto-select first chat if none selected
  // Only runs when chats list changes AND no chat is currently selected
  useEffect(() => {
    if (!repository) return;

    let cancelled = false;
    let pendingChatId: string | null = null;
    let pendingChat: ChatState["chats"][number] | null = null;

    setState((prev) => {
      // Skip if already have a chat selected or no chats available
      if (prev.currentChatId || !prev.chats.length) {
        return prev;
      }

      const [firstChat] = prev.chats;
      if (!firstChat) {
        return prev;
      }

      pendingChatId = firstChat.id;
      pendingChat = firstChat;

      return {
        ...prev,
        isLoading: true,
      };
    });

    if (!pendingChatId || !pendingChat) {
      return () => {
        cancelled = true;
      };
    }

    repository
      .getMessages(pendingChatId)
      .then((messages) => {
        if (cancelled) return;

        setState((current) => {
          if (
            current.currentChatId &&
            current.currentChatId !== pendingChatId
          ) {
            return current.isLoading
              ? { ...current, isLoading: false }
              : current;
          }

          const nextChat =
            current.chats.find((chat) => chat.id === pendingChatId) ??
            pendingChat;

          if (!nextChat) {
            return {
              ...current,
              isLoading: false,
            };
          }

          return {
            ...current,
            currentChatId: nextChat.id,
            currentChat: nextChat,
            messages,
            isLoading: false,
          };
        });
      })
      .catch((error) => {
        if (cancelled) return;

        logger.error("Failed to load messages for first chat:", error);

        setState((current) => ({
          ...current,
          isLoading: false,
          error: getErrorMessage(
            error,
            "Failed to load messages for first chat",
          ),
        }));
      });

    return () => {
      cancelled = true;
    };
  }, [repository, setState]);
}
