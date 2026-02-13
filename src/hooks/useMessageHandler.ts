/**
 * Message Handler Hook
 * Core logic for sending messages and managing chat flow
 * Handles both authenticated and unauthenticated message sending
 * Manages chat creation, selection, and title updates
 */

import { useCallback, useRef } from "react";
import { logger } from "@/lib/logger";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import type { ChatActions, ChatState } from "@/hooks/types";

/**
 * Dependencies required by the message handler hook
 * @interface UseMessageHandlerDeps
 */
interface UseMessageHandlerDeps {
  // State
  /** Flag indicating if AI is currently generating a response */
  isGenerating: boolean;
  /** ID of the currently active chat, null if no chat selected */
  currentChatId: string | null;
  /** User authentication status */
  /** Total number of messages sent in current session */
  messageCount: number;
  /** Current chat state including messages and available chats */
  chatState: Pick<ChatState, "messages" | "chats">;

  // Actions
  /** Update the generation status flag */
  setIsGenerating: (value: boolean) => void;
  /** Update the message counter */
  setMessageCount: (value: number) => void;

  // Functions
  /** Create a new chat and return its ID */
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  /** Conditionally show follow-up prompts based on context */
  maybeShowFollowUpPrompt: () => void;
  /** Chat management actions */
  chatActions: ChatActions;
  /**
   * Navigate to a chat by ID via URL. Used instead of `chatActions.selectChat`
   * to enforce URL as the single source of truth for chat selection.
   * See `docs/contracts/navigation.md`.
   */
  navigateToChat: (chatId: string) => void;
  /** Surface user-visible errors when message sending fails */
  setErrorMessage?: (message: string) => void;
}

/**
 * Hook for handling message sending and chat management
 *
 * Features:
 * - Automatic chat creation when needed
 * - Intelligent chat reuse from existing messages
 * - Title generation for new chats
 * - Support for both authenticated and unauthenticated flows
 * - Follow-up prompt management
 *
 * @param {UseMessageHandlerDeps} deps - Required dependencies
 * @returns {Object} Message handler functions and refs
 */
export function useMessageHandler(deps: UseMessageHandlerDeps) {
  const sendRef = useRef<
    ((message: string, imageStorageIds?: string[]) => Promise<void>) | null
  >(null);

  /**
   * Main message sending handler
   * Manages chat selection/creation and message dispatch
   *
   * @param {string} messageInput - The message to send
   */
  const handleSendMessage = useCallback(
    async (messageInput: string, imageStorageIds?: string[]) => {
      if (!messageInput.trim() && !imageStorageIds?.length) return;

      let activeChatId: string | null = deps.currentChatId;

      // FIX: Check for existing messages first to prevent new chat creation
      if (!activeChatId && deps.chatState.messages.length > 0) {
        const firstMsg = deps.chatState.messages[0];
        const existingChatId =
          firstMsg && typeof firstMsg.chatId === "string"
            ? firstMsg.chatId
            : undefined;
        if (existingChatId) {
          logger.info("[OK] Found existing chat from messages", {
            existingChatId,
          });
          activeChatId = existingChatId;
          // Navigate via URL so useUrlStateSync drives the state update.
          // Do NOT call selectChat directly — see docs/contracts/navigation.md.
          deps.navigateToChat(existingChatId);
        }
      }

      // Only create new chat if truly needed
      if (!activeChatId) {
        logger.debug("No chat exists, creating new one");
        const newChatId = await deps.handleNewChat();
        if (!newChatId) {
          logger.error("[ERROR] Failed to create chat for message");
          return;
        }
        // Frontend uses string chat IDs; avoid unsafe casts
        activeChatId = newChatId;
      }

      // Send the message
      try {
        deps.setIsGenerating(true);
        deps.setMessageCount(deps.messageCount + 1);

        // Use unified chat action for ALL users (authenticated and anonymous)
        // This ensures messages are always persisted to Convex
        if (!deps.chatActions.sendMessage) {
          throw new Error("Message sending is currently unavailable.");
        }

        await deps.chatActions.sendMessage(
          activeChatId,
          messageInput.trim(),
          imageStorageIds,
        );

        // Title updates handled server-side during streaming persistence
        // This ensures titles persist to Convex and survive page refresh

        deps.maybeShowFollowUpPrompt();
      } catch (error) {
        logger.error("Failed to send message", error);
        // Surface error to user via UI feedback
        if (deps.setErrorMessage) {
          deps.setErrorMessage(
            getErrorMessage(error, "Failed to send message"),
          );
        }
      } finally {
        deps.setIsGenerating(false);
      }
    },
    [deps],
  );

  sendRef.current = async (msg: string, ids?: string[]) =>
    handleSendMessage(msg, ids);

  return {
    handleSendMessage,
    sendRef,
  };
}
