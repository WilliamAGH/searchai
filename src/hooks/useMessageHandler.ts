import { useCallback, useRef } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import { logger } from "../lib/logger";

interface UseMessageHandlerDeps {
  // State
  isGenerating: boolean;
  currentChatId: string | null;
  showFollowUpPrompt: boolean;
  isAuthenticated: boolean;
  messageCount: number;
  messages: any[];
  chatState: any;
  lastPlannerCallAtByChat: Record<string, number>;

  // Actions
  setIsGenerating: (value: boolean) => void;
  setMessageCount: (value: number) => void;
  setLastPlannerCallAtByChat: (value: Record<string, number>) => void;
  setPendingMessage: (value: string) => void;

  // Functions
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  resetFollowUp: () => void;
  onRequestSignUp?: () => void;
  planSearch: any;
  isTopicChange: (current: string, previous: string) => boolean;
  generateResponse: any;
  generateUnauthenticatedResponse: (
    message: string,
    chatId: string,
  ) => Promise<void>;
  maybeShowFollowUpPrompt: () => void;
  chatActions: any;
}

export function useMessageHandler(deps: UseMessageHandlerDeps) {
  const sendRef = useRef<((message: string) => Promise<void>) | null>(null);

  const handleSendMessage = useCallback(
    async (message: string) => {
      if (!message.trim()) return;

      let activeChatId = deps.currentChatId;

      // FIX: Check for existing messages first to prevent new chat creation
      if (!activeChatId && deps.chatState.messages.length > 0) {
        const existingChatId = deps.chatState.messages[0]?.chatId;
        if (existingChatId) {
          logger.info("✅ Found existing chat from messages", {
            existingChatId,
          });
          activeChatId = existingChatId;
          // Ensure state is updated
          await deps.chatActions.selectChat(existingChatId);
        }
      }

      // Only create new chat if truly needed
      if (!activeChatId) {
        logger.debug("📝 No chat exists, creating new one");
        const newChatId = await deps.handleNewChat();
        if (!newChatId) {
          logger.error("❌ Failed to create chat for message");
          return;
        }
        activeChatId = deps.isAuthenticated
          ? (newChatId as Id<"chats">)
          : newChatId;
      }

      // Send the message
      try {
        deps.setIsGenerating(true);
        deps.setMessageCount(deps.messageCount + 1);

        if (deps.isAuthenticated) {
          await deps.generateResponse({
            chatId: activeChatId,
            message: message.trim(),
            isReplyToAssistant:
              deps.chatState.messages.length > 0 &&
              deps.chatState.messages[deps.chatState.messages.length - 1]
                ?.role === "assistant",
          });
        } else {
          await deps.generateUnauthenticatedResponse(
            message.trim(),
            activeChatId,
          );
        }

        // Update chat title if needed (only for first user message)
        const userMessageCount = deps.chatState.messages.filter(
          (m: any) => m.role === "user",
        ).length;
        if (userMessageCount === 0) {
          const title =
            message.length > 50 ? `${message.substring(0, 50)}...` : message;
          await deps.chatActions.updateChat(activeChatId, { title });
        }

        deps.maybeShowFollowUpPrompt();
      } catch (error) {
        logger.error("Failed to send message", error);
      } finally {
        deps.setIsGenerating(false);
      }
    },
    [deps],
  );

  sendRef.current = handleSendMessage;

  return {
    handleSendMessage,
    sendRef,
  };
}
