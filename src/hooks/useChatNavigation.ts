import { useCallback } from "react";
import { useNavigate } from "react-router-dom";

interface UseChatNavigationProps {
  currentChatId: string | null;
  allChats: Array<{ id: string }>;
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

  const buildChatPath = useCallback(
    (
      chatId: string,
      opts?: { privacy?: "private" | "shared" | "public"; shareId?: string; publicId?: string },
    ) => {
      if (opts?.privacy === "shared" && opts.shareId) return `/s/${opts.shareId}`;
      if (opts?.privacy === "public" && opts.publicId) return `/p/${opts.publicId}`;
      return `/chat/${chatId}`;
    },
    [],
  );

  const navigateWithVerification = useCallback(
    async (chatId: string) => {
      const chatExists = allChats.some((chat) => chat.id === chatId);
      if (chatExists) {
        await onSelectChat(chatId);
        navigate(buildChatPath(chatId));
        return true;
      }
      return false;
    },
    [allChats, onSelectChat, navigate, buildChatPath],
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
