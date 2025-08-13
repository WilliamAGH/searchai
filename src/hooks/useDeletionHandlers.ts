import { useState, useCallback } from "react";
import type { Id } from "../../convex/_generated/dataModel";

interface UseDeletionHandlersProps {
  chatState: any;
  chatActions: any;
  deleteChat: any;
  deleteMessage: any;
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
  const [undoBanner, setUndoBanner] = useState<UndoBannerState>({
    show: false,
    message: "",
  });

  const handleDeleteLocalChat = useCallback(
    async (chatId: string) => {
      // Store chat data for undo
      const chatToDelete = chatState.chats.find((c: any) => c.id === chatId);

      if (chatToDelete) {
        // Perform deletion
        await chatActions.deleteChat(chatId);

        // Show undo banner
        setUndoBanner({
          show: true,
          message: `Chat "${chatToDelete.title || "Untitled"}" deleted`,
          action: () => {
            // Restore chat
            chatActions.createChat(chatToDelete);
            setUndoBanner({ show: false, message: "" });
          },
        });

        // Auto-hide after 5 seconds
        setTimeout(() => {
          setUndoBanner((prev) =>
            prev.message ===
            `Chat "${chatToDelete.title || "Untitled"}" deleted`
              ? { show: false, message: "" }
              : prev,
          );
        }, 5000);
      }
    },
    [chatState.chats, chatActions],
  );

  const handleRequestDeleteChat = useCallback(
    async (chatId: Id<"chats">) => {
      try {
        await deleteChat({ chatId });

        // Show success banner
        setUndoBanner({
          show: true,
          message: "Chat deleted successfully",
        });

        // Auto-hide after 3 seconds
        setTimeout(() => {
          setUndoBanner({ show: false, message: "" });
        }, 3000);
      } catch (error) {
        console.error("Failed to delete chat:", error);
        setUndoBanner({
          show: true,
          message: "Failed to delete chat",
        });
      }
    },
    [deleteChat],
  );

  const handleDeleteLocalMessage = useCallback(
    async (messageId: string) => {
      // Store message data for undo
      const messageToDelete = chatState.messages.find(
        (m: any) => m.id === messageId,
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
            setUndoBanner({ show: false, message: "" });
          },
        });

        // Auto-hide after 5 seconds
        setTimeout(() => {
          setUndoBanner((prev) =>
            prev.message === "Message deleted"
              ? { show: false, message: "" }
              : prev,
          );
        }, 5000);
      }
    },
    [chatState.messages, chatActions],
  );

  const handleRequestDeleteMessage = useCallback(
    async (messageId: Id<"messages">) => {
      try {
        await deleteMessage({ messageId });

        // Show success banner
        setUndoBanner({
          show: true,
          message: "Message deleted",
        });

        // Auto-hide after 3 seconds
        setTimeout(() => {
          setUndoBanner({ show: false, message: "" });
        }, 3000);
      } catch (error) {
        console.error("Failed to delete message:", error);
        setUndoBanner({
          show: true,
          message: "Failed to delete message",
        });
      }
    },
    [deleteMessage],
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
