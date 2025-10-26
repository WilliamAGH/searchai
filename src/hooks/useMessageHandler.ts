/**
 * Message Handler Hook
 * Core logic for sending messages and managing chat flow
 * Handles both authenticated and unauthenticated message sending
 * Manages chat creation, selection, and title updates
 */

import { useCallback, useRef } from "react";
import { logger } from "../lib/logger";
import type { Message } from "../lib/types/message";
import type { Chat } from "../lib/types/chat";

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
  /** Whether to show follow-up prompt suggestions */
  showFollowUpPrompt: boolean;
  /** User authentication status */
  isAuthenticated: boolean;
  /** Total number of messages sent in current session */
  messageCount: number;
  /** List of messages in current context */
  messages: Message[];
  /** Current chat state including messages and available chats */
  chatState: {
    messages: Message[];
    chats: Chat[];
  };
  /** Tracking of last planner API calls by chat ID for rate limiting */
  lastPlannerCallAtByChat: Record<string, number>;

  // Actions
  /** Update the generation status flag */
  setIsGenerating: (value: boolean) => void;
  /** Update the message counter */
  setMessageCount: (value: number) => void;
  /** Update planner call tracking */
  setLastPlannerCallAtByChat: (value: Record<string, number>) => void;
  /** Set a pending message to be sent */
  setPendingMessage: (value: string) => void;

  // Functions
  /** Create a new chat and return its ID */
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  /** Reset follow-up prompt state */
  resetFollowUp: () => void;
  /** Optional callback to trigger sign-up flow */
  onRequestSignUp?: () => void;
  /** Search planning function (implementation varies) */
  planSearch: unknown;
  /** Check if the message indicates a topic change */
  isTopicChange: (current: string, previous: string) => boolean;
  /** Generate AI response for authenticated users */
  generateResponse: (args: {
    chatId: string;
    message: string;
    isReplyToAssistant?: boolean;
  }) => Promise<unknown>;
  /** Generate AI response for unauthenticated users */
  generateUnauthenticatedResponse: (
    message: string,
    chatId: string,
  ) => Promise<void>;
  /** Conditionally show follow-up prompts based on context */
  maybeShowFollowUpPrompt: () => void;
  /** Chat management actions */
  chatActions: {
    /** Select and activate a chat */
    selectChat: (id: string) => Promise<void>;
    /** Update chat properties */
    updateChat: (id: string, updates: Partial<Chat>) => Promise<void>;
    /** Send a message in the current chat */
    sendMessage?: (chatId: string, message: string) => Promise<void>;
  };
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
  const sendRef = useRef<((message: string) => Promise<void>) | null>(null);

  /**
   * Main message sending handler
   * Manages chat selection/creation and message dispatch
   *
   * @param {unknown} messageInput - The message to send (coerced to string)
   */
  const handleSendMessage = useCallback(
    async (messageInput: unknown) => {
      const message =
        typeof messageInput === "string"
          ? messageInput
          : String(messageInput ?? "");
      if (!message.trim()) return;

      let activeChatId: string | null = deps.currentChatId;

      // FIX: Check for existing messages first to prevent new chat creation
      if (!activeChatId && deps.chatState.messages.length > 0) {
        const firstMsg = deps.chatState.messages[0];
        const existingChatId =
          firstMsg && typeof firstMsg.chatId === "string"
            ? firstMsg.chatId
            : undefined;
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

        await deps.chatActions.sendMessage(activeChatId, message.trim());

        // Title updates handled server-side during streaming persistence
        // This ensures titles persist to Convex and survive page refresh

        deps.maybeShowFollowUpPrompt();
      } catch (error) {
        logger.error("Failed to send message", error);
        if (deps.setErrorMessage) {
          const message =
            error instanceof Error ? error.message : "Failed to send message";
          deps.setErrorMessage(message);
        }
      } finally {
        deps.setIsGenerating(false);
      }
    },
    [deps],
  );

  sendRef.current = async (msg: string) => handleSendMessage(msg);

  return {
    handleSendMessage,
    sendRef,
  };
}
