import { useCallback } from "react";
import { logger } from "../lib/logger";

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

  const navigateWithVerification = useCallback(
    async (chatId: string) => {
      logger.debug("[NAV] navigateWithVerification called with:", chatId);
      logger.debug("[NAV] All chats count:", allChats.length);
      logger.debug(
        "[NAV] All chat IDs:",
        allChats.map((c) => c.id),
      );
      logger.debug("[NAV] Looking for:", chatId);
      logger.debug(
        "[NAV] Chat details:",
        allChats.map((c) => ({
          id: c.id,
          _id: (c as unknown as { _id?: string })._id,
          title: c.title,
        })),
      );

      const chatExists = allChats.some((chat) => chat.id === chatId);
      logger.debug("[NAV] Chat exists?", chatExists);

      if (chatExists) {
        // CRITICAL: Only select the chat, don't navigate
        // The URL sync will handle navigation automatically
        logger.debug("[NAV] Calling onSelectChat with:", chatId);
        await onSelectChat(chatId);
        logger.debug("[NAV] onSelectChat completed");
        // REMOVED: navigate(buildChatPath(chatId)); - this causes loops!
        return true;
      }

      // Chat doesn't exist in current list - might be stale or deleted
      console.warn(
        "[NAV] Chat not found in current list, attempting direct selection",
        {
          requestedId: chatId,
          availableIds: allChats.map((c) => c.id).slice(0, 5), // Show first 5 for debugging
        },
      );

      // Try to select it anyway - it might exist in the backend
      // This allows navigation to work even if local state is out of sync
      await onSelectChat(chatId);
      return true;
    },
    [allChats, onSelectChat],
  );

  const handleSelectChat = useCallback(
    async (chatId: string) => {
      logger.debug("[NAV] handleSelectChat called with:", chatId);
      logger.debug("[NAV] Current chat ID:", currentChatId);

      if (chatId !== currentChatId) {
        logger.debug("[NAV] Different chat, calling navigateWithVerification");
        await navigateWithVerification(chatId);
      } else {
        logger.debug("[NAV] Same chat, skipping navigation");
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
