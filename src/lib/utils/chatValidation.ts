// src/lib/utils/chatValidation.ts
import { logger } from "@/lib/logger";

export interface ChatValidationResult {
  isValid: boolean;
  suggestedChatId: string | null;
  reason?: string;
  confidence: number;
}

export function validateChatContext(
  currentChatId: string | null,
  messages: Array<{ chatId: string; role: string }>,
  chats: Array<{ id: string }>,
): ChatValidationResult {
  // Case 1: Assistant-first message (prioritize this specific scenario)
  if (
    messages.length === 1 &&
    messages[0].role === "assistant" &&
    !currentChatId
  ) {
    return {
      isValid: false,
      suggestedChatId: messages[0].chatId,
      reason: "Assistant sent first message, chat ID needs to be set",
      confidence: 0.9,
    };
  }

  // Case 2: No chat ID but have messages
  if (!currentChatId && messages.length > 0) {
    const msgChatId = messages[0].chatId;
    const chatExists = chats.some((c) => c.id === msgChatId);

    logger.debug("Chat validation: missing ID but found in messages", {
      msgChatId,
      chatExists,
    });

    return {
      isValid: false,
      suggestedChatId: msgChatId,
      reason: "Chat ID missing but found in messages",
      confidence: chatExists ? 0.95 : 0.7,
    };
  }

  // Case 3: Chat ID mismatch
  if (currentChatId && messages.length > 0) {
    const allSameChatId = messages.every((m) => m.chatId === currentChatId);
    if (!allSameChatId) {
      const primaryChatId = messages[0].chatId;

      logger.warn("Chat validation: ID mismatch", {
        currentId: currentChatId,
        messageId: primaryChatId,
      });

      return {
        isValid: false,
        suggestedChatId: primaryChatId,
        reason: "Chat ID mismatch with messages",
        confidence: 0.8,
      };
    }
  }

  return {
    isValid: true,
    suggestedChatId: null,
    confidence: 1.0,
  };
}
