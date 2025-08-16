/**
 * Chat Actions Hook
 * Provides all chat-related actions and operations
 */

import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import type { UnifiedChat, UnifiedMessage } from "../lib/types/unified";
import { TitleUtils } from "../lib/types/unified";
import { logger } from "../lib/logger";
// Minimal fallback to avoid missing StorageService import during build
const storageService = {
  clearAll() {
    try {
      localStorage.clear();
    } catch (error) {
      logger.error("Failed to clear localStorage", { error });
    }
  },
};

export interface ChatActions {
  // Chat management
  createChat: (title?: string) => Promise<UnifiedChat>;
  selectChat: (id: string | null) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  updateChatTitle: (id: string, title: string) => Promise<void>;

  // Local storage operations (for gradual migration)
  setChats: (chats: UnifiedChat[]) => void;
  addChat: (chat: UnifiedChat) => void;
  removeChat: (id: string) => void;
  updateChat: (id: string, updates: Partial<UnifiedChat>) => void;

  // Message operations
  sendMessage: (chatId: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  addMessage: (message: UnifiedMessage) => void;
  removeMessage: (id: string) => void;
  updateMessage: (id: string, updates: Partial<UnifiedMessage>) => void;
  setMessages: (messages: UnifiedMessage[]) => void;

  // Sharing
  shareChat: (
    id: string,
    privacy: "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string }>;

  // UI State Management
  handleToggleSidebar: () => void;
  handleContinueChat: () => void;
  handleNewChatForFollowUp: () => Promise<void>;
  handleNewChatWithSummary: () => Promise<void>;
  handleDraftChange: (draft: string) => void;
  handleShare: (
    privacy: "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string }>;
  handleRequestDeleteChat: (id: string) => void;
  handleRequestDeleteMessage: (id: string) => void;
  setShowFollowUpPrompt: (show: boolean) => void;
  setShowShareModal: (show: boolean) => void;
  setPendingMessage: (message: string) => void;
  addToHistory: (message: string) => void;

  // Utility
  refreshChats: () => Promise<void>;
  clearError: () => void;
  clearLocalStorage: () => void;
}

/**
 * Creates chat actions for managing chat state
 * @param repository - Chat repository for persistence (null for unauthenticated)
 * @param state - Current chat state
 * @param setState - State setter function
 * @returns Object containing all chat actions
 */
export function createChatActions(
  repository: IChatRepository | null,
  state: ChatState,
  setState: Dispatch<SetStateAction<ChatState>>,
): ChatActions {
  return {
    async createChat(title?: string) {
      if (!repository) throw new Error("Repository not initialized");

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const requestedTitle = title ?? "New Chat";
        const result = await repository.createChat(requestedTitle);
        // Support repositories that return either the chat directly or an object with a chat property
        const chat = ((): UnifiedChat | null => {
          const unknownResult = result as unknown;
          if (
            unknownResult &&
            typeof unknownResult === "object" &&
            "chat" in (unknownResult as Record<string, unknown>)
          ) {
            const maybeChat = (unknownResult as { chat?: unknown }).chat;
            return (maybeChat as UnifiedChat) ?? null;
          }
          return unknownResult as UnifiedChat;
        })();
        if (!chat) throw new Error("Failed to create chat");

        setState((prev) => ({
          ...prev,
          chats: [chat, ...prev.chats],
          currentChatId: chat.id,
          currentChat: chat,
          messages: [],
          isLoading: false,
          error: null,
        }));

        return chat;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Failed to create chat",
        }));
        throw error;
      }
    },

    async selectChat(id: string | null) {
      logger.debug("[CHAT_ACTIONS] selectChat called with:", id);
      logger.debug("[CHAT_ACTIONS] Current repository:", repository?.type);

      if (!id) {
        logger.debug("[CHAT_ACTIONS] Clearing current chat (id is null)");
        setState((prev) => ({
          ...prev,
          currentChatId: null,
          currentChat: null,
          messages: [],
        }));
        return;
      }

      if (!repository) {
        console.error("[CHAT_ACTIONS] No repository available!");
        return;
      }

      try {
        logger.debug("[CHAT_ACTIONS] Fetching chat with ID:", id);
        // Fetch chat and messages
        const chat = await repository.getChatById(id);
        logger.debug("[CHAT_ACTIONS] Retrieved chat:", chat);

        // For non-paginated users, we need to fetch messages
        // Paginated users will get messages from usePaginatedMessages
        let messages: UnifiedMessage[] = [];
        if ("getMessages" in repository) {
          messages = await repository.getMessages(id);
        }

        if (chat) {
          logger.debug("[CHAT_ACTIONS] Setting current chat to:", id);
          logger.debug("[CHAT_ACTIONS] Chat details:", {
            id: chat.id,
            _id: chat._id,
            title: chat.title,
            messageCount: messages.length,
          });
          setState((prev) => ({
            ...prev,
            currentChatId: id,
            currentChat: chat,
            messages, // Update messages for non-paginated users
            error: null,
          }));
        } else {
          console.error("[CHAT_ACTIONS] Chat not found for ID:", id);
        }
      } catch (error) {
        console.error("[CHAT_ACTIONS] Error selecting chat:", error);
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to select chat",
        }));
      }
    },

    async deleteChat(id: string) {
      if (!repository) return;

      try {
        await repository.deleteChat(id);

        setState((prev) => {
          const filtered = prev.chats.filter((c) => c.id !== id);
          const wasCurrentChat = prev.currentChatId === id;

          return {
            ...prev,
            chats: filtered,
            currentChatId: wasCurrentChat ? null : prev.currentChatId,
            currentChat: wasCurrentChat ? null : prev.currentChat,
            messages: wasCurrentChat ? [] : prev.messages,
            error: null,
          };
        });
      } catch (error) {
        // Check if it's a "chat not found" error - this is okay, just remove from UI
        const errorMessage =
          error instanceof Error ? error.message : String(error);
        const isChatNotFound = errorMessage.includes("Chat not found");

        if (isChatNotFound) {
          // Chat already deleted from backend, just clean up UI
          logger.warn(
            "[CHAT_ACTIONS] Chat not found in backend, removing from UI:",
            id,
          );
          setState((prev) => {
            const filtered = prev.chats.filter((c) => c.id !== id);
            const wasCurrentChat = prev.currentChatId === id;

            return {
              ...prev,
              chats: filtered,
              currentChatId: wasCurrentChat ? null : prev.currentChatId,
              currentChat: wasCurrentChat ? null : prev.currentChat,
              messages: wasCurrentChat ? [] : prev.messages,
              error: null, // No error for user since we handled it
            };
          });
        } else {
          // Other errors should be shown to user and re-thrown for tests
          setState((prev) => ({
            ...prev,
            error: errorMessage,
          }));
          throw error;
        }
      }
    },

    async updateChatTitle(id: string, title: string) {
      if (!repository) return;

      try {
        await repository.updateChatTitle(id, title);

        setState((prev) => ({
          ...prev,
          chats: prev.chats.map((c) =>
            c.id === id ? { ...c, title: TitleUtils.sanitize(title) } : c,
          ),
          currentChat:
            prev.currentChat?.id === id
              ? { ...prev.currentChat, title: TitleUtils.sanitize(title) }
              : prev.currentChat,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to update title",
        }));
      }
    },

    // Local storage operations
    setChats(chats: UnifiedChat[]) {
      setState((prev) => ({ ...prev, chats }));
    },

    addChat(chat: UnifiedChat) {
      setState((prev) => ({ ...prev, chats: [chat, ...prev.chats] }));
    },

    removeChat(id: string) {
      setState((prev) => ({
        ...prev,
        chats: prev.chats.filter((c) => c.id !== id),
      }));
    },

    updateChat(id: string, updates: Partial<UnifiedChat>) {
      setState((prev) => ({
        ...prev,
        chats: prev.chats.map((c) => (c.id === id ? { ...c, ...updates } : c)),
      }));
    },

    // Message operations
    async sendMessage(chatId: string, content: string) {
      // Validate inputs
      if (!repository || !chatId || !content) {
        logger.warn("sendMessage called with invalid parameters", {
          hasRepository: !!repository,
          chatId,
          contentLength: content?.length,
        });
        return;
      }

      // Create a temporary ID for the streaming AI message with random component to ensure uniqueness
      const tempAIMessageId = `streaming-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

      // Add user message immediately with unique ID
      const userMessage: UnifiedMessage = {
        id: `user-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: "user",
        content,
        timestamp: Date.now(),
        isStreaming: false,
      };

      // FIXED: Add placeholder AI message immediately to show loading state
      const placeholderAIMessage: UnifiedMessage = {
        id: tempAIMessageId,
        role: "assistant",
        content: "", // Empty content initially
        timestamp: Date.now(),
        isStreaming: true,
        thinking: "Processing your request", // Show thinking state immediately
      };

      // Update state to show generation is starting with both messages
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        error: null,
        currentChatId: chatId,
        currentChat:
          prev.chats.find((c) => c.id === chatId) || prev.currentChat,
        messages: [...prev.messages, userMessage, placeholderAIMessage],
        searchProgress: {
          stage: "searching",
          message: "Searching for information",
        },
      }));

      try {
        // Send message and get streaming response
        const generator = repository.generateResponse(chatId, content);

        let fullContent = "";

        for await (const chunk of generator) {
          if (chunk.type === "content") {
            fullContent += chunk.content;

            // FIXED: Update the existing placeholder message instead of adding a new one
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((msg) =>
                msg.id === tempAIMessageId
                  ? {
                      ...msg,
                      content: fullContent,
                      thinking: fullContent ? "" : "Processing", // Clear thinking when content starts
                      isStreaming: true,
                    }
                  : msg,
              ),
              searchProgress: fullContent
                ? { stage: "generating" }
                : prev.searchProgress,
            }));
          } else if (chunk.type === "metadata" && chunk.metadata?.thinking) {
            // Update thinking/reasoning if provided
            setState((prev) => ({
              ...prev,
              messages: prev.messages.map((msg) =>
                msg.id === tempAIMessageId
                  ? { ...msg, thinking: chunk.metadata.thinking }
                  : msg,
              ),
            }));
          } else if (chunk.type === "error") {
            throw new Error(chunk.error);
          }
        }

        // For non-paginated users, fetch the final messages after generation
        // Paginated users will get updates via subscription
        if ("getMessages" in repository) {
          try {
            const finalMessages = await repository.getMessages(chatId);
            setState((prev) => ({
              ...prev,
              messages: finalMessages,
              isGenerating: false,
              searchProgress: { stage: "idle" },
              currentChatId: chatId,
              currentChat:
                prev.chats.find((c) => c.id === chatId) || prev.currentChat,
            }));
          } catch (error) {
            logger.error("Failed to fetch messages after generation", error);
            setState((prev) => ({
              ...prev,
              isGenerating: false,
              searchProgress: { stage: "idle" },
              error: "Failed to fetch messages after generation",
            }));
          }
        } else {
          // For paginated users, just update generation state
          setState((prev) => ({
            ...prev,
            isGenerating: false,
            searchProgress: { stage: "idle" },
            currentChatId: chatId,
            currentChat:
              prev.chats.find((c) => c.id === chatId) || prev.currentChat,
          }));
        }
      } catch (error) {
        // Remove the temporary streaming message on error
        setState((prev) => ({
          ...prev,
          messages: prev.messages.filter((msg) => msg.id !== tempAIMessageId),
          isGenerating: false,
          error:
            error instanceof Error ? error.message : "Failed to send message",
          searchProgress: { stage: "idle" },
        }));
      }
    },

    async deleteMessage(id: string) {
      if (!repository) return;

      try {
        await repository.deleteMessage(id);

        setState((prev) => ({
          ...prev,
          messages: prev.messages.filter((m) => m.id !== id),
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to delete message",
        }));
      }
    },

    addMessage(message: UnifiedMessage) {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
      }));
    },

    removeMessage(id: string) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => m.id !== id),
      }));
    },

    updateMessage(id: string, updates: Partial<UnifiedMessage>) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          m.id === id ? { ...m, ...updates } : m,
        ),
      }));
    },

    setMessages(messages: UnifiedMessage[]) {
      setState((prev) => ({ ...prev, messages }));
    },

    // Sharing
    async shareChat(id: string, privacy: "shared" | "public") {
      if (!repository) throw new Error("Repository not initialized");

      try {
        const result = await repository.shareChat(id, privacy);
        setState((prev) => ({
          ...prev,
          error: null,
        }));
        return result;
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to share chat",
        }));
        throw error;
      }
    },

    // UI State Management
    handleToggleSidebar() {
      setState((prev) => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }));
    },

    handleContinueChat() {
      setState((prev) => ({
        ...prev,
        showFollowUpPrompt: false,
      }));
    },

    async handleNewChatForFollowUp() {
      setState((prev) => ({
        ...prev,
        showFollowUpPrompt: false,
      }));
      // Create new chat logic would go here
    },

    async handleNewChatWithSummary() {
      setState((prev) => ({
        ...prev,
        showFollowUpPrompt: false,
      }));
      // Create new chat with summary logic would go here
    },

    handleDraftChange(draft: string) {
      setState((prev) => ({ ...prev, pendingMessage: draft }));
    },

    async handleShare(privacy: "shared" | "public") {
      if (!state.currentChatId) throw new Error("No chat selected");
      return this.shareChat(state.currentChatId, privacy);
    },

    handleRequestDeleteChat(id: string) {
      setState((prev) => ({
        ...prev,
        undoBanner: {
          type: "chat",
          id,
          expiresAt: Date.now() + 5000,
        },
      }));
    },

    handleRequestDeleteMessage(id: string) {
      setState((prev) => ({
        ...prev,
        undoBanner: {
          type: "message",
          id,
          expiresAt: Date.now() + 5000,
        },
      }));
    },

    setShowFollowUpPrompt(show: boolean) {
      setState((prev) => ({ ...prev, showFollowUpPrompt: show }));
    },

    setShowShareModal(show: boolean) {
      setState((prev) => ({ ...prev, showShareModal: show }));
    },

    setPendingMessage(message: string) {
      setState((prev) => ({ ...prev, pendingMessage: message }));
    },

    addToHistory(message: string) {
      setState((prev) => ({
        ...prev,
        userHistory: [...prev.userHistory, message],
      }));
    },

    // Utility
    async refreshChats() {
      if (!repository) return;

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const chats = await repository.getChats();
        setState((prev) => ({
          ...prev,
          chats,
          isLoading: false,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          isLoading: false,
          error:
            error instanceof Error ? error.message : "Failed to refresh chats",
        }));
      }
    },

    clearError() {
      setState((prev) => ({ ...prev, error: null }));
    },

    clearLocalStorage() {
      if (typeof window !== "undefined") {
        logger.info("Clearing local storage");
        storageService.clearAll();
        setState((prev) => ({
          ...prev,
          chats: [],
          currentChatId: null,
          currentChat: null,
          messages: [],
        }));
      }
    },
  };
}
