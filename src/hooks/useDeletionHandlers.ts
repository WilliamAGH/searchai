import { useState, useCallback, useEffect, useRef } from "react";
import { logger } from "../lib/logger";
import type { Id } from "../../convex/_generated/dataModel";

interface UseDeletionHandlersProps {
  chatState: {
    chats: Array<{ id: string; title?: string }>;
    messages: Array<{ id: string }>;
  };
  chatActions: {
    deleteChat: (id: string) => Promise<void>;
    createChat: (chat: { id: string; title?: string }) => void;
    deleteMessage: (id: string) => Promise<void>;
    addMessage: (msg: { id: string }) => void;
  };
  deleteChat: (args: { chatId: Id<"chats"> }) => Promise<void>;
  deleteMessage: (args: { messageId: Id<"messages"> }) => Promise<void>;
}

interface UndoBannerState {
  show: boolean;
  message: string;
  action?: () => void;
}

/**
 * Hook to handle deletion operations with undo functionality
 */
export function useDeletionHandlers({
  chatState,
  chatActions,
  deleteChat,
  deleteMessage,
}: UseDeletionHandlersProps) {
  const [undoBanner, setUndoBanner] = useState<UndoBannerState | null>(null);
  const timeoutsRef = useRef<number[]>([]);

  const clearAllTimeouts = useCallback(() => {
    for (const id of timeoutsRef.current) {
      clearTimeout(id);
    }
    timeoutsRef.current = [];
  }, []);

  useEffect(() => {
    return () => {
      clearAllTimeouts();
    };
  }, [clearAllTimeouts]);

  const handleDeleteLocalChat = useCallback(
    async (chatId: string) => {
      // Store chat data for undo
      const chatToDelete = chatState.chats.find((c) => c.id === chatId);

      if (chatToDelete) {
        // Perform deletion
        await chatActions.deleteChat(chatId);

        // Show undo banner
        setUndoBanner({
          show: true,
          message: `Chat "${chatToDelete.title || "Untitled"}" deleted`,
          action: () => {
            // Restore chat
            chatActions.createChat(
              chatToDelete as { id: string; title?: string },
            );
            setUndoBanner(null);
          },
        });

        // Auto-hide after 5 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner((prev) =>
            prev?.message ===
            `Chat "${chatToDelete.title || "Untitled"}" deleted`
              ? null
              : prev,
          );
        }, 5000);
        timeoutsRef.current.push(timeoutId);
      }
    },
    [chatState.chats, chatActions, clearAllTimeouts],
  );

  const handleRequestDeleteChat = useCallback(
    async (chatId: Id<"chats"> | string) => {
      try {
        // Convert string to Id<"chats"> if needed
        const convexChatId = chatId as Id<"chats">;
        await deleteChat({ chatId: convexChatId });

        // Show success banner
        setUndoBanner({
          show: true,
          message: "Chat deleted successfully",
        });

        // Auto-hide after 3 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner({ show: false, message: "" });
        }, 3000);
        timeoutsRef.current.push(timeoutId);
      } catch (error) {
        logger.error("Failed to delete chat:", error);
        setUndoBanner({
          show: true,
          message: "Failed to delete chat",
        });
      }
    },
    [deleteChat, clearAllTimeouts],
  );

  const handleDeleteLocalMessage = useCallback(
    async (messageId: string) => {
      // Store message data for undo
      const messageToDelete = chatState.messages.find(
        (m) => m.id === messageId,
      );

      if (messageToDelete) {
        // Perform deletion
        await chatActions.deleteMessage(messageId);

        // Show undo banner
        setUndoBanner({
          show: true,
          message: "Message deleted",
          action: () => {
            // Restore message
            chatActions.addMessage(messageToDelete);
            setUndoBanner(null);
          },
        });

        // Auto-hide after 5 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner((prev) =>
            prev?.message === "Message deleted" ? null : prev,
          );
        }, 5000);
        timeoutsRef.current.push(timeoutId);
      }
    },
    [chatState.messages, chatActions, clearAllTimeouts],
  );

  const handleRequestDeleteMessage = useCallback(
    async (messageId: Id<"messages"> | string) => {
      try {
        // Convert string to Id<"messages"> if needed
        const convexMessageId = messageId as Id<"messages">;
        await deleteMessage({ messageId: convexMessageId });

        // Show success banner
        setUndoBanner({
          show: true,
          message: "Message deleted",
        });

        // Auto-hide after 3 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner({ show: false, message: "" });
        }, 3000);
        timeoutsRef.current.push(timeoutId);
      } catch (error) {
        logger.error("Failed to delete message:", error);
        setUndoBanner({
          show: true,
          message: "Failed to delete message",
        });
      }
    },
    [deleteMessage, clearAllTimeouts],
  );

  return {
    handleDeleteLocalChat,
    handleRequestDeleteChat,
    handleDeleteLocalMessage,
    handleRequestDeleteMessage,
    undoBanner,
    setUndoBanner,
  };
}
