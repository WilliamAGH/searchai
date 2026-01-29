/**
 * Hook for chat navigation with verification
 * Handles URL-based navigation ensuring chat existence before routing.
 * Provides path building and verified navigation for chat selection.
 */

import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Chat } from "@/lib/types/chat";

interface UseChatNavigationProps {
  currentChatId: string | null;
  allChats: Chat[];
  onSelectChat: (chatId: string) => Promise<void>;
}

export function useChatNavigation({
  currentChatId,
  allChats,
  onSelectChat,
}: UseChatNavigationProps) {
  const navigate = useNavigate();

  const buildChatPath = useCallback((chatId: string) => {
    return `/chat/${chatId}`;
  }, []);

  const resolveChatId = useCallback((chat: Chat): string => {
    if (typeof chat._id === "string") {
      return chat._id;
    }

    return "";
  }, []);

  const navigateWithVerification = useCallback(
    async (chatId: string) => {
      const normalizedChatId = String(chatId);
      const chatExists = allChats.some((chat) => resolveChatId(chat) === normalizedChatId);

      if (!chatExists) {
        return false;
      }

      await onSelectChat(normalizedChatId);
      void navigate(buildChatPath(normalizedChatId));
      return true;
    },
    [allChats, onSelectChat, navigate, buildChatPath, resolveChatId],
  );

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      if (chatId !== currentChatId) {
        await navigateWithVerification(chatId);
      }
    },
    [currentChatId, navigateWithVerification],
  );

  return {
    navigateWithVerification,
    buildChatPath,
    handleSelectChat,
  };
}
