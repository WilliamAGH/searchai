/**
 * Chat Actions Hook
 * Provides all chat-related actions and operations
 */

import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "@/lib/repositories/ChatRepository";
import type { ChatState } from "@/hooks/useChatState";
import type { Message } from "@/lib/types/message";
import type { Doc } from "../../convex/_generated/dataModel";
import { TitleUtils } from "@/lib/types/unified";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { logger } from "@/lib/logger";
import { sendMessageWithStreaming } from "@/hooks/chatActions/sendMessage";

export interface ChatActions {
  // Chat management
  createChat: (title?: string) => Promise<Doc<"chats">>;
  selectChat: (id: string | null) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  updateChatTitle: (id: string, title: string) => Promise<void>;

  // Message operations
  sendMessage: (
    chatId: string,
    content: string,
    imageStorageIds?: string[],
  ) => Promise<void>;
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
 * Creates chat actions for managing chat state.
 * All actions use the setState updater form to read current state,
 * so no stale `state` capture is needed.
 */
export function createChatActions(
  repository: IChatRepository | null,
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
        const chat = await repository.getChatById(id);

        if (chat) {
          const canonicalChatId = String(chat._id);
          const messages = await repository.getMessages(canonicalChatId);
          setState((prev) => ({
            ...prev,
            currentChatId: canonicalChatId,
            currentChat: chat,
            // Preserve in-flight optimistic messages for this chat so
            // URL-driven selection does not wipe streaming placeholders.
            //
            // ID-based dedup is impossible here: optimistic messages use
            // local IDs (msg_xxx) that never match Convex-assigned IDs.
            // When actively generating for this chat, keep the optimistic
            // messages as the live source of truth. Once generation ends,
            // DB messages contain everything and are authoritative.
            messages:
              prev.isGenerating && prev.currentChatId === canonicalChatId
                ? prev.messages
                : messages,
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
    async sendMessage(
      chatId: string,
      content: string,
      imageStorageIds?: string[],
    ) {
      if (!repository) {
        logger.warn("sendMessage called without repository", { chatId });
        return;
      }
      await sendMessageWithStreaming({
        repository,
        setState,
        chatId,
        content,
        imageStorageIds,
      });
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
