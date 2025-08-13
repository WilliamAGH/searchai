/**
 * Service for creating and managing chats
 * Handles both authenticated and unauthenticated chat creation
 */

import { logger } from "../logger";
import type { Id } from "../../../convex/_generated/dataModel";
import type { LocalChat } from "../types/chat";

export interface ChatCreationActions {
  setCurrentChatId: (chatId: string | null) => Promise<void>;
  createLocalChat: (chat: LocalChat) => Promise<string>;
}

export interface ChatCreationOptions {
  userInitiated?: boolean;
  existingMessages?: Array<{ chatId: string; role: string }>;
}

export class ChatCreationService {
  constructor() {}

  /**
   * Create a new chat with race condition prevention
   * Checks for existing messages before creating new chat
   */
  async createChat(
    isAuthenticated: boolean,
    actions: ChatCreationActions,
    opts: ChatCreationOptions = {},
  ): Promise<string | null> {
    try {
      // CRITICAL: Check for existing messages first (Race Condition Fix A4)
      if (opts.existingMessages && opts.existingMessages.length > 0) {
        const existingChatId = opts.existingMessages[0].chatId;
        if (existingChatId) {
          logger.info("Using existing chat instead of creating new", {
            existingChatId,
          });
          await actions.setCurrentChatId(existingChatId);
          return existingChatId;
        }
      }

      // Generate new chat ID
      const chatId = this.generateChatId(isAuthenticated);

      // Create the chat
      const newChat = {
        id: chatId,
        _id: chatId,
        title: "New Chat",
        createdAt: Date.now(),
        updatedAt: Date.now(),
        privacy: "private" as const,
        isLocal: !isAuthenticated,
      };

      // Save to repository
      const createdId = await actions.createLocalChat(newChat);

      // Set as current
      await actions.setCurrentChatId(createdId);

      logger.info("Created new chat", {
        chatId: createdId,
        userInitiated: opts.userInitiated,
      });

      return createdId;
    } catch (error) {
      logger.error("Failed to create chat", error);
      return null;
    }
  }

  private generateChatId(isAuthenticated: boolean): string {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return isAuthenticated
      ? (`chat_${timestamp}_${random}` as Id<"chats">)
      : `local_${timestamp}_${random}`;
  }

  /**
   * Validate if a chat needs to be created
   */
  shouldCreateNewChat(
    currentChatId: string | null,
    messages: Array<{ chatId: string }>,
  ): boolean {
    // Don't create if we already have a chat ID
    if (currentChatId) return false;

    // Don't create if messages exist (they have a chat ID)
    if (messages.length > 0 && messages[0].chatId) return false;

    return true;
  }
}
