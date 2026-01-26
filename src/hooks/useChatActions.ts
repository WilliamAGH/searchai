/**
 * Chat Actions Hook
 * Provides all chat-related actions and operations
 */

import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import type { Message } from "../lib/types/message";
import { createLocalUIMessage } from "../lib/types/message";
import type { Doc } from "../../convex/_generated/dataModel";
import { TitleUtils, IdUtils } from "../lib/types/unified";
import { getErrorMessage } from "../lib/utils/errorUtils";
import { logger } from "../lib/logger";
import { StreamEventHandler } from "./utils/streamHandler";

export interface ChatActions {
  // Chat management
  createChat: (title?: string) => Promise<Doc<"chats">>;
  selectChat: (id: string | null) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  updateChatTitle: (id: string, title: string) => Promise<void>;

  // Message operations
  sendMessage: (chatId: string, content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;
  addMessage: (message: Message) => void;
  removeMessage: (id: string) => void;
  updateMessage: (id: string, updates: Partial<Message>) => void;
  setMessages: (messages: Message[]) => void;

  // Sharing
  shareChat: (
    id: string,
    privacy: "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string }>;

  // UI State Management
  handleToggleSidebar: () => void;
  setShowFollowUpPrompt: (show: boolean) => void;
  setShowShareModal: (show: boolean) => void;
  setPendingMessage: (message: string) => void;
  addToHistory: (message: string) => void;
  setError: (message: string) => void;

  // Utility
  refreshChats: () => Promise<void>;
  clearError: () => void;
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
        const chat = result.chat;
        if (!chat) throw new Error("Failed to create chat");

        // Don't manually add chat to state - the reactive useQuery will handle it
        // This prevents duplicate chats from appearing in the sidebar
        setState((prev) => ({
          ...prev,
          currentChatId: chat._id,
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

      if (!repository) {
        // Repository not initialized - user is likely unauthenticated
        // Log for debugging but don't throw (graceful degradation for guest users)
        logger.debug("selectChat called without repository", { chatId: id });
        return;
      }

      try {
        // Parallelize fetching chat and messages
        const [chat, messages] = await Promise.all([
          repository.getChatById(id),
          repository.getMessages(id),
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
          const filtered = prev.chats.filter((c) => c._id !== id);
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
            c._id === id ? { ...c, title: TitleUtils.sanitize(title) } : c,
          ),
          currentChat:
            prev.currentChat?._id === id
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
      const userMessage = createLocalUIMessage({
        id: userMessageId,
        chatId,
        role: "user",
        content,
      });

      // Create assistant placeholder
      const assistantPlaceholderId = IdUtils.generateLocalId("msg");
      const assistantPlaceholder = createLocalUIMessage({
        id: assistantPlaceholderId,
        chatId,
        role: "assistant",
        content: "",
        isStreaming: true,
        reasoning: "",
        searchResults: [],
        sources: [],
      });

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
          prev.chats.find((c) => c._id === chatId) || prev.currentChat,
        messages: [...prev.messages, userMessage, assistantPlaceholder],
      }));

      try {
        // Send message and get streaming response
        const generator = repository.generateResponse(chatId, content);
        const streamHandler = new StreamEventHandler(setState, chatId);

        for await (const chunk of generator) {
          streamHandler.handle(chunk);
        }

        // If persistence wasn't confirmed via SSE, clean up streaming state
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
        // Note: We intentionally skip refresh after persist - optimistic state is source of truth
        // Refreshing causes UI flickering because DB messages have different IDs
      } catch (error) {
        logger.error("Failed to send message:", error);
        setState((prev) => ({
          ...prev,
          isGenerating: false,
          error: getErrorMessage(error, "Failed to send message"),
          searchProgress: { stage: "idle" },
          // Clear streaming flags on the last assistant message to avoid stuck UI
          messages: prev.messages.map((m, index) =>
            index === prev.messages.length - 1 && m.role === "assistant"
              ? { ...m, isStreaming: false, thinking: undefined }
              : m,
          ),
        }));
      }
    },

    async deleteMessage(id: string) {
      if (!repository) return;

      try {
        await repository.deleteMessage(id);

        setState((prev) => ({
          ...prev,
          messages: prev.messages.filter((m) => String(m._id) !== id),
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error: getErrorMessage(error, "Failed to delete message"),
        }));
      }
    },

    addMessage(message: Message) {
      setState((prev) => ({
        ...prev,
        messages: [...prev.messages, message],
      }));
    },

    removeMessage(id: string) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => String(m._id) !== id),
      }));
    },

    updateMessage(id: string, updates: Partial<Message>) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.map((m) =>
          String(m._id) === id ? { ...m, ...updates } : m,
        ),
      }));
    },

    setMessages(messages: Message[]) {
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
  };
}
