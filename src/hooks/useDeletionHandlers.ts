import { useState, useCallback, useEffect, useRef } from "react";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { toConvexId } from "@/lib/utils/idValidation";
import type { Id } from "../../convex/_generated/dataModel";
import type { Message } from "@/lib/types/message";

interface UseDeletionHandlersProps {
  chatState?: {
    messages: Message[];
  };
  chatActions?: {
    removeMessage: (id: string) => void;
    addMessage: (message: Message) => void;
  };
  deleteChat: (args: { chatId: Id<"chats">; sessionId?: string }) => Promise<null>;
  deleteMessage: (args: { messageId: Id<"messages">; sessionId?: string }) => Promise<null>;
  sessionId?: string;
}

interface UndoBannerState {
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
  sessionId,
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

  const handleRequestDeleteChat = useCallback(
    async (chatId: Id<"chats"> | string) => {
      try {
        const resolvedChatId = typeof chatId === "string" ? toConvexId<"chats">(chatId) : chatId;
        if (!resolvedChatId) {
          throw new Error(`Invalid chat ID for deletion: ${chatId}`);
        }
        await deleteChat({ chatId: resolvedChatId, sessionId });

        // Show success banner
        setUndoBanner({
          message: "Chat deleted successfully",
        });

        // Auto-hide after 2 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner(null);
        }, 2000);
        timeoutsRef.current.push(timeoutId);
      } catch (error) {
        // Only show error banner if it's not a "not found" error (already deleted)
        const errorMessage = getErrorMessage(error);
        if (!errorMessage.includes("Chat not found")) {
          logger.error("Failed to delete chat:", error);
          setUndoBanner({
            message: "Failed to delete chat",
          });
        }
      }
    },
    [deleteChat, sessionId, clearAllTimeouts],
  );

  const handleDeleteLocalMessage = useCallback(
    async (messageId: string) => {
      if (!chatState || !chatActions) return;
      const messageToDelete = chatState.messages.find((m) => String(m._id) === messageId);

      if (!messageToDelete) return;

      chatActions.removeMessage(messageId);

      setUndoBanner({
        message: "Message deleted",
        action: () => {
          chatActions.addMessage(messageToDelete);
          setUndoBanner(null);
        },
      });

      clearAllTimeouts();
      const timeoutId = window.setTimeout(() => {
        setUndoBanner((prev) => (prev?.message === "Message deleted" ? null : prev));
      }, 2000);
      timeoutsRef.current.push(timeoutId);
    },
    [chatActions, chatState, clearAllTimeouts],
  );

  const handleRequestDeleteMessage = useCallback(
    async (messageId: Id<"messages"> | string) => {
      try {
        const resolvedMessageId =
          typeof messageId === "string" ? toConvexId<"messages">(messageId) : messageId;
        if (!resolvedMessageId) {
          await handleDeleteLocalMessage(String(messageId));
          return;
        }
        await deleteMessage({ messageId: resolvedMessageId, sessionId });

        // Show success banner
        setUndoBanner({
          message: "Message deleted",
        });

        // Auto-hide after 2 seconds (with cleanup)
        clearAllTimeouts();
        const timeoutId = window.setTimeout(() => {
          setUndoBanner(null);
        }, 2000);
        timeoutsRef.current.push(timeoutId);
      } catch (error) {
        logger.error("Failed to delete message:", error);
        setUndoBanner({
          message: "Failed to delete message",
        });
      }
    },
    [deleteMessage, sessionId, clearAllTimeouts, handleDeleteLocalMessage],
  );

  return {
    handleRequestDeleteChat,
    handleRequestDeleteMessage,
    undoBanner,
    setUndoBanner,
  };
}
