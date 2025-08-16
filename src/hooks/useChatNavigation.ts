import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { logger } from "../lib/logger";

interface UseChatNavigationProps {
  currentChatId: string | null;
  // Accept items with either `id` (UnifiedChat) or `_id` (Doc/LocalChat)
  allChats: Array<{ id?: string; _id?: string; title?: string }>;
  isAuthenticated: boolean;
  onSelectChat: (chatId: string) => Promise<void>;
}

export function useChatNavigation({
  currentChatId,
  allChats: _allChats,
  isAuthenticated: _isAuthenticated,
  onSelectChat,
}: UseChatNavigationProps) {
  const navigate = useNavigate();

  const buildChatPath = useCallback(
    (
      chatId: string,
      opts?: {
        privacy?: "private" | "shared" | "public";
        shareId?: string;
        publicId?: string;
      },
    ) => {
      if (opts?.privacy === "shared" && opts.shareId)
        return `/s/${opts.shareId}`;
      if (opts?.privacy === "public" && opts.publicId)
        return `/p/${opts.publicId}`;
      return `/chat/${chatId}`;
    },
    [],
  );

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      logger.debug("[NAV] handleSelectChat called with:", chatId);
      logger.debug("[NAV] Current chat ID:", currentChatId);

      if (chatId !== currentChatId) {
        logger.debug("[NAV] Different chat, selecting and navigating");
        // First select the chat
        await onSelectChat(chatId);

        // Then navigate to the chat path
        const chatPath = buildChatPath(chatId);
        logger.debug("[NAV] Navigating to:", chatPath);
        navigate(chatPath);
      } else {
        logger.debug("[NAV] Same chat, skipping navigation");
      }
    },
    [currentChatId, onSelectChat, buildChatPath, navigate],
  );

  return {
    buildChatPath,
    handleSelectChat,
  };
}
