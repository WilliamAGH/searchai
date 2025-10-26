import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import type { Chat } from "../lib/types/chat";

interface UseChatNavigationProps {
  currentChatId: string | null;
  allChats: Chat[];
  isAuthenticated: boolean;
  onSelectChat: (chatId: string) => Promise<void>;
}

export function useChatNavigation({
  currentChatId,
  allChats,
  isAuthenticated: _isAuthenticated,
  onSelectChat,
}: UseChatNavigationProps) {
  const navigate = useNavigate();

  const buildChatPath = useCallback((chatId: string) => {
    return `/chat/${chatId}`;
  }, []);

  const resolveChatId = useCallback((chat: Chat): string => {
    if (typeof (chat as { id?: unknown }).id === "string") {
      return String((chat as { id: string }).id);
    }

    const maybeId = (chat as { _id?: unknown })._id;
    if (typeof maybeId === "string") {
      return maybeId;
    }

    return "";
  }, []);

  const navigateWithVerification = useCallback(
    async (chatId: string) => {
      const normalizedChatId = String(chatId);
      const chatExists = allChats.some(
        (chat) => resolveChatId(chat) === normalizedChatId,
      );

      if (!chatExists) {
        return false;
      }

      await onSelectChat(normalizedChatId);
      navigate(buildChatPath(normalizedChatId));
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
