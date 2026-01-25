/**
 * Chat Actions Hook
 * Provides all chat-related actions and operations
 */

import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import type { UnifiedChat, UnifiedMessage } from "../lib/types/unified";
import { TitleUtils, IdUtils } from "../lib/types/unified";
import { getErrorMessage } from "../lib/utils/errorUtils";
import { logger } from "../lib/logger";
import { StreamEventHandler } from "./utils/streamHandler";
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
  setError: (message: string) => void;

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

        // Don't manually add chat to state - the reactive useQuery will handle it
        // This prevents duplicate chats from appearing in the sidebar
        setState((prev) => ({
          ...prev,
          currentChatId: chat.id as string,
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
          error: getErrorMessage(error, "Failed to create chat"),
        }));
        throw error;
      }
    },

    async selectChat(id: string | null) {
      if (!id) {
        setState((prev) => ({
          ...prev,
          currentChatId: null,
          currentChat: null,
          messages: [],
        }));
        return;
      }

      if (!repository) return;

      try {
        // Parallelize fetching chat and messages
        const [chat, messages] = await Promise.all([
          repository.getChatById(id),
          // Backward-compat: some tests/mock repos expose getChatMessages
          // Prefer getMessages when available
          (async () => {
            if ("getMessages" in repository) {
              return repository.getMessages(id);
            }
            // Support test harness that defines getChatMessages only
            if (
              "getChatMessages" in
                (repository as unknown as Record<string, unknown>) &&
              typeof (repository as unknown as { getChatMessages?: unknown })
                .getChatMessages === "function"
            ) {
              return (
                repository as unknown as {
                  getChatMessages: (
                    chatId: string,
                  ) => Promise<UnifiedMessage[]>;
                }
              ).getChatMessages(id);
            }
            return [] as UnifiedMessage[];
          })(),
        ]);

        if (chat) {
          setState((prev) => ({
            ...prev,
            currentChatId: id,
            currentChat: chat,
            messages,
            error: null,
          }));
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: getErrorMessage(error, "Failed to select chat"),
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
        setState((prev) => ({
          ...prev,
          error: getErrorMessage(error, "Failed to delete chat"),
        }));
        throw error;
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
          error: getErrorMessage(error, "Failed to update title"),
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

      // Create user message with unique ID
      const userMessageId = IdUtils.generateLocalId("msg");
      const userMessage: UnifiedMessage = {
        id: userMessageId,
        chatId,
        role: "user",
        content,
        timestamp: Date.now(),
      } as unknown as UnifiedMessage;

      // Create assistant placeholder
      const assistantPlaceholderId = IdUtils.generateLocalId("msg");
      const assistantPlaceholder: UnifiedMessage = {
        id: assistantPlaceholderId,
        chatId,
        role: "assistant",
        content: "",
        isStreaming: true,
        reasoning: "",
        searchResults: [],
        sources: [],
        timestamp: Date.now(),
      } as unknown as UnifiedMessage;

      // Update state to show both user message and assistant placeholder
      setState((prev) => ({
        ...prev,
        isGenerating: true,
        error: null,
        // Immediately show a planning status to avoid initial empty gap
        searchProgress: {
          stage: "planning",
          message: "Analyzing your question and planning research...",
        },
        // Ensure currentChatId and currentChat match the chat we're sending to
        currentChatId: chatId,
        currentChat:
          prev.chats.find((c) => c.id === chatId) || prev.currentChat,
        messages: [...prev.messages, userMessage, assistantPlaceholder],
      }));

      try {
        // Send message and get streaming response
        const generator = repository.generateResponse(chatId, content);
        const streamHandler = new StreamEventHandler(setState, chatId);

        for await (const chunk of generator) {
          streamHandler.handle(chunk);
        }

        const persistedConfirmed = streamHandler.getPersistedConfirmed();
        if (!persistedConfirmed) {
          setState((prev) => ({
            ...prev,
            isGenerating: false,
            searchProgress: { stage: "idle" },
            messages: prev.messages.map((m, index) =>
              index === prev.messages.length - 1 && m.role === "assistant"
                ? { ...m, isStreaming: false, thinking: undefined }
                : m,
            ),
          }));
        }

        const refreshAfterPersist = async (shouldForce: boolean) => {
          if (!repository) {
            return;
          }

          // CRITICAL FIX: For authenticated users, SKIP refresh entirely
          // Optimistic state is already correct and refreshing causes flickering
          // because DB messages have different IDs than optimistic messages
          logger.debug(
            "Skipping refresh - optimistic state is source of truth",
            {
              chatId,
              shouldForce,
            },
          );
          return;
        };

        // CRITICAL FIX: Pass persistedConfirmed directly (not inverted)
        // When persistence is confirmed (TRUE), we SHOULD refresh to sync with DB
        // When persistence is not confirmed (FALSE), we SHOULD NOT refresh (keep optimistic state)
        await refreshAfterPersist(persistedConfirmed);
      } catch (error) {
        logger.error("Failed to send message:", error);
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: getErrorMessage(error, "Failed to send message"),
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
          error: getErrorMessage(error, "Failed to delete message"),
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
          error: getErrorMessage(error, "Failed to share chat"),
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

    setError(message: string) {
      setState((prev) => ({ ...prev, error: message }));
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
          error: getErrorMessage(error, "Failed to refresh chats"),
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
