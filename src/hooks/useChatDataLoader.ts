/**
 * Chat Data Loader Hook
 *
 * Handles initial data loading and sync with reactive Convex subscriptions.
 *
 * ## Navigation interaction
 *
 * The auto-select effect (below) sets `currentChatId` directly via setState
 * when no chat is selected and chats are available (returning-user UX).
 * This is one of three permitted direct-state exceptions documented in
 * `docs/contracts/navigation.md`. After auto-selection, `useUrlStateSync`
 * step 4 navigates to `/chat/${autoSelectedId}` to keep the URL in sync.
 */

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { IChatRepository } from "@/lib/repositories/ChatRepository";
import type { ChatState } from "@/hooks/useChatState";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "../../convex/lib/errors";
import { useAnonymousSession } from "@/hooks/useAnonymousSession";

export function useChatDataLoader(
  repository: IChatRepository | null,
  setState: Dispatch<SetStateAction<ChatState>>,
) {
  const sessionId = useAnonymousSession();

  // Use reactive Convex query for chat list (auto-updates on changes)
  const convexChats = useQuery<typeof api.chats.getUserChats>(
    api.chats.getUserChats,
    repository ? { sessionId: sessionId || undefined } : "skip",
  );

  // Update state when Convex data changes (reactive)
  useEffect(() => {
    if (!repository || convexChats === undefined) return;

    try {
      const chats = convexChats || [];

      setState((prev) => {
        const currentChat = prev.currentChatId
          ? (chats.find((chat) => chat._id === prev.currentChatId) ??
            prev.currentChat)
          : prev.currentChat;

        return {
          ...prev,
          chats,
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

  // Auto-select first chat if none selected (returning-user UX).
  // This is a permitted direct-state exception (see docs/contracts/navigation.md).
  // useUrlStateSync step 4 will navigate to /chat/${id} after this sets state.
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

      // Extract chat ID, handling both Convex Id<"chats"> and edge cases
      const chatId = firstChat._id;
      if (!chatId) {
        return prev;
      }
      pendingChatId = String(chatId);
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

    const matchesPendingId = (chat: ChatState["chats"][number]) =>
      String(chat._id ?? "") === String(pendingChatId);

    const applyAutoSelect = (messages: ChatState["messages"]) => {
      if (cancelled) return;
      setState((current) => {
        if (current.currentChatId && current.currentChatId !== pendingChatId) {
          return current.isLoading ? { ...current, isLoading: false } : current;
        }

        const nextChat = current.chats.find(matchesPendingId) ?? pendingChat;
        if (!nextChat) {
          return { ...current, isLoading: false };
        }

        return {
          ...current,
          currentChatId: String(nextChat._id ?? ""),
          currentChat: nextChat,
          messages,
          isLoading: false,
        };
      });
    };

    repository
      .getMessages(pendingChatId)
      .then(applyAutoSelect)
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
