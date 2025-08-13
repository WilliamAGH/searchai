/**
 * Unified Chat Hook
 * Provides a single interface for chat operations regardless of auth status
 * Automatically handles repository selection and migration
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useConvexAuth, useConvex } from "convex/react";
import { IChatRepository } from "../lib/repositories/ChatRepository";
import { LocalChatRepository } from "../lib/repositories/LocalChatRepository";
import { ConvexChatRepository } from "../lib/repositories/ConvexChatRepository";
import {
  UnifiedChat,
  UnifiedMessage,
  IdUtils,
  TitleUtils,
  DEFAULT_FEATURE_FLAGS,
} from "../lib/types/unified";
import { MigrationService } from "../lib/services/MigrationService";

export interface ChatState {
  chats: UnifiedChat[];
  currentChatId: string | null;
  currentChat: UnifiedChat | null;
  messages: UnifiedMessage[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  searchProgress: {
    stage: "idle" | "searching" | "scraping" | "analyzing" | "generating";
    message?: string;
  };
  featureFlags: typeof DEFAULT_FEATURE_FLAGS;
  // New fields from ChatInterface
  showFollowUpPrompt: boolean;
  pendingMessage: string;
  plannerHint?: { reason?: string; confidence?: number };
  undoBanner?: { type: "chat" | "message"; id: string; expiresAt: number };
  messageCount: number;
  showShareModal: boolean;
  userHistory: string[];
  isMobile: boolean;
  isSidebarOpen: boolean;
}

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
  sendMessage: (content: string) => Promise<void>;
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

export function useUnifiedChat() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const convexClient = useConvex();

  // Repository selection based on auth status
  const repository = useMemo<IChatRepository | null>(() => {
    if (authLoading) return null;

    if (isAuthenticated && convexClient) {
      return new ConvexChatRepository(convexClient);
    }

    // Pass convex URL to LocalChatRepository for API calls
    const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
    return new LocalChatRepository(convexUrl);
  }, [isAuthenticated, authLoading, convexClient]);

  // State management
  const [state, setState] = useState<ChatState>({
    chats: [],
    currentChatId: null,
    currentChat: null,
    messages: [],
    isLoading: false,
    isGenerating: false,
    error: null,
    searchProgress: { stage: "idle" },
    featureFlags: DEFAULT_FEATURE_FLAGS,
    // New fields
    showFollowUpPrompt: false,
    pendingMessage: "",
    plannerHint: undefined,
    undoBanner: undefined,
    messageCount: 0,
    showShareModal: false,
    userHistory: [],
    isMobile: typeof window !== "undefined" && window.innerWidth < 768,
    isSidebarOpen: false,
  });

  // Migration tracking
  const hasMigratedRef = useRef(false);

  // Load chats on mount and auth change
  useEffect(() => {
    if (!repository) return;

    const loadChats = async () => {
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
            error instanceof Error ? error.message : "Failed to load chats",
        }));
      }
    };

    loadChats();
  }, [repository]);

  // Load messages when current chat changes
  useEffect(() => {
    const currentChatId = state.currentChatId;
    if (!repository || !currentChatId) return;

    const loadMessages = async () => {
      try {
        const messages = await repository.getMessages(currentChatId);
        setState((prev) => ({
          ...prev,
          messages,
          error: null,
        }));
      } catch (error) {
        setState((prev) => ({
          ...prev,
          messages: [],
          error:
            error instanceof Error ? error.message : "Failed to load messages",
        }));
      }
    };

    loadMessages();
  }, [repository, state.currentChatId]);

  // Auto-migration on authentication
  useEffect(() => {
    if (!isAuthenticated || hasMigratedRef.current || !repository) return;

    const migrate = async () => {
      if (!state.featureFlags.autoMigration) return;

      try {
        const localRepo = new LocalChatRepository();
        const { chats } = await localRepo.exportData();

        if (chats.length === 0) {
          hasMigratedRef.current = true;
          return;
        }

        const migrationService = new MigrationService(
          localRepo,
          repository as ConvexChatRepository,
        );

        const result = await migrationService.migrateUserData();

        if (result.success) {
          hasMigratedRef.current = true;

          // Refresh chats after migration
          const newChats = await repository.getChats();
          setState((prev) => ({ ...prev, chats: newChats }));

          // If we had a current chat, try to map it to the new ID
          const currentChatId = state.currentChatId;
          if (currentChatId && result.mapping) {
            const newId = result.mapping.get(currentChatId);
            if (newId) {
              setState((prev) => ({ ...prev, currentChatId: newId }));
            }
          }
        }
      } catch (error) {
        console.error("Migration failed:", error);
      }
    };

    migrate();
  }, [
    isAuthenticated,
    repository,
    state.featureFlags.autoMigration,
    state.currentChatId,
  ]);

  // Actions
  const actions: ChatActions = {
    async createChat(title?: string) {
      if (!repository) throw new Error("Repository not initialized");

      setState((prev) => ({ ...prev, isLoading: true }));
      try {
        const { chat } = await repository.createChat(title);

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
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to delete chat",
        }));
      }
    },

    async updateChatTitle(id: string, title: string) {
      if (!repository) return;

      try {
        await repository.updateChatTitle(id, title);

        setState((prev) => {
          const updated = prev.chats.map((c) =>
            c.id === id ? { ...c, title, updatedAt: Date.now() } : c,
          );

          return {
            ...prev,
            chats: updated,
            currentChat:
              prev.currentChatId === id && prev.currentChat
                ? { ...prev.currentChat, title, updatedAt: Date.now() }
                : prev.currentChat,
            error: null,
          };
        });
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to update title",
        }));
      }
    },

    async sendMessage(content: string) {
      if (!repository) return;

      let chatId = state.currentChatId;

      // FIX: Extract chat ID from messages if needed (race condition fix)
      if (!chatId && state.messages.length > 0) {
        chatId = state.messages[0].chatId;
        setState((prev) => ({
          ...prev,
          currentChatId: chatId,
          currentChat: prev.chats.find((c) => c.id === chatId) || null,
        }));
      }

      // Still no chat ID means we need to create one
      if (!chatId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        searchProgress: { stage: "searching", message: "Searching the web..." },
      }));

      try {
        // Check storage mode from repository
        const storageMode = repository.getStorageType();

        // Handle message based on storage mode
        if (storageMode === "convex") {
          // For Convex mode, the backend handles both user and assistant messages
          // Don't call addMessage - Convex backend handles both messages

          // Update title if first message
          if (state.messages.length === 0) {
            const title = TitleUtils.generateFromContent(trimmed);
            await repository.updateChatTitle(chatId, title);

            setState((prev) => {
              const updated = prev.chats.map((c) =>
                c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c,
              );

              return {
                ...prev,
                chats: updated,
                currentChat: prev.currentChat
                  ? { ...prev.currentChat, title }
                  : null,
              };
            });
          }
        } else {
          // Local mode - add message then generate
          const userMessage = await repository.addMessage(chatId, {
            role: "user",
            content: trimmed,
          });

          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, userMessage],
          }));

          // Update title if first message
          if (state.messages.length === 0) {
            const title = TitleUtils.generateFromContent(trimmed);
            await repository.updateChatTitle(chatId, title);

            setState((prev) => {
              const updated = prev.chats.map((c) =>
                c.id === chatId ? { ...c, title, updatedAt: Date.now() } : c,
              );

              return {
                ...prev,
                chats: updated,
                currentChat: prev.currentChat
                  ? { ...prev.currentChat, title }
                  : null,
              };
            });
          }

          // Generate AI response placeholder for local mode
          const assistantMessage: UnifiedMessage = {
            id: IdUtils.generateLocalId("msg"),
            chatId: chatId,
            role: "assistant",
            content: "",
            timestamp: Date.now(),
            source: "local",
            synced: false,
            isStreaming: true,
          };

          setState((prev) => ({
            ...prev,
            messages: [...prev.messages, assistantMessage],
          }));
        }

        // Stream response - common for both modes
        const stream = repository.generateResponse(chatId, trimmed);
        let fullContent = "";

        for await (const chunk of stream) {
          if (chunk.type === "content") {
            fullContent += chunk.content || "";

            setState((prev) => {
              const updated = [...prev.messages];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  content: fullContent,
                };
              }
              return { ...prev, messages: updated };
            });
          } else if (chunk.type === "metadata") {
            setState((prev) => {
              const updated = [...prev.messages];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  ...chunk.metadata,
                };
              }
              return { ...prev, messages: updated };
            });
          } else if (chunk.type === "error") {
            throw new Error(chunk.error);
          } else if (chunk.type === "done") {
            setState((prev) => {
              const updated = [...prev.messages];
              const lastIndex = updated.length - 1;
              if (lastIndex >= 0 && updated[lastIndex].role === "assistant") {
                updated[lastIndex] = {
                  ...updated[lastIndex],
                  isStreaming: false,
                };
              }
              return {
                ...prev,
                messages: updated,
                searchProgress: { stage: "idle" },
              };
            });
            break;
          }
        }
      } catch (error) {
        setState((prev) => ({
          ...prev,
          error:
            error instanceof Error ? error.message : "Failed to send message",
        }));
      } finally {
        setState((prev) => ({
          ...prev,
          isGenerating: false,
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

    async shareChat(id: string, privacy: "shared" | "public") {
      if (!repository) throw new Error("Repository not initialized");

      try {
        const result = await repository.shareChat(id, privacy);

        setState((prev) => {
          const updated = prev.chats.map((c) =>
            c.id === id
              ? {
                  ...c,
                  privacy,
                  shareId: result.shareId,
                  publicId: result.publicId,
                }
              : c,
          );

          return {
            ...prev,
            chats: updated,
            currentChat:
              prev.currentChatId === id && prev.currentChat
                ? {
                    ...prev.currentChat,
                    privacy,
                    shareId: result.shareId,
                    publicId: result.publicId,
                  }
                : prev.currentChat,
            error: null,
          };
        });

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

    // Local storage operations for gradual migration
    setChats(chats: UnifiedChat[]) {
      setState((prev) => ({ ...prev, chats }));
    },

    addChat(chat: UnifiedChat) {
      setState((prev) => {
        // Prevent duplicate chats by checking if chat with same id already exists
        const exists = prev.chats.some((c) => c.id === chat.id);
        if (exists) {
          console.warn(
            `Chat with id ${chat.id} already exists, skipping duplicate addition`,
          );
          return prev;
        }
        return { ...prev, chats: [chat, ...prev.chats] };
      });
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

    setMessages(messages: UnifiedMessage[]) {
      setState((prev) => ({ ...prev, messages }));
    },

    addMessage(message: UnifiedMessage) {
      setState((prev) => {
        // Prevent duplicate messages by checking if message with same id already exists
        const exists = prev.messages.some((m) => m.id === message.id);
        if (exists) {
          console.warn(
            `Message with id ${message.id} already exists, skipping duplicate addition`,
          );
          return prev;
        }
        return { ...prev, messages: [...prev.messages, message] };
      });
    },

    removeMessage(id: string) {
      setState((prev) => ({
        ...prev,
        messages: prev.messages.filter((m) => m.id !== id),
      }));
    },

    updateMessage(id: string, updates: Partial<UnifiedMessage>) {
      setState((prev) => {
        const messageIndex = prev.messages.findIndex((m) => m.id === id);
        if (messageIndex === -1) {
          console.error("Message not found for update!", id);
          return prev;
        }
        return {
          ...prev,
          messages: prev.messages.map((m) =>
            m.id === id ? { ...m, ...updates } : m,
          ),
        };
      });
    },

    clearLocalStorage() {
      // Clear local storage for gradual migration
      setState((prev) => ({
        ...prev,
        chats: [],
        messages: [],
        currentChatId: null,
        currentChat: null,
      }));

      // Also clear from repository if it's local storage based
      if (repository && repository.getStorageType() === "local") {
        // Clear the localStorage directly for local repository
        const storageNamespace = `searchai:${window.location.host}`;
        try {
          window.localStorage.removeItem(`${storageNamespace}:chats`);
          window.localStorage.removeItem(`${storageNamespace}:messages`);
        } catch (e) {
          console.error("Failed to clear local storage:", e);
        }
      }
    },

    // UI State Management Actions
    handleToggleSidebar() {
      setState((prev) => ({ ...prev, isSidebarOpen: !prev.isSidebarOpen }));
    },

    handleContinueChat() {
      setState((prev) => ({
        ...prev,
        showFollowUpPrompt: false,
        pendingMessage: "",
      }));
    },

    async handleNewChatForFollowUp() {
      // Create a new chat and move pending message there
      const pendingMsg = state.pendingMessage;
      setState((prev) => ({
        ...prev,
        showFollowUpPrompt: false,
        pendingMessage: "",
      }));

      if (pendingMsg && repository) {
        const newChat = await actions.createChat(
          TitleUtils.generateFromContent(pendingMsg),
        );
        await actions.selectChat(newChat.id);
        await actions.sendMessage(pendingMsg);
      }
    },

    async handleNewChatWithSummary() {
      // Create a new chat with a summary of the current conversation
      if (!state.currentChat || state.messages.length === 0) return;

      const summary = state.messages
        .slice(-5)
        .map((m) => `${m.role}: ${m.content.slice(0, 100)}`)
        .join("\n");

      const title = `Continuation of: ${state.currentChat.title}`;
      const newChat = await actions.createChat(title);
      await actions.selectChat(newChat.id);

      // Optionally add a system message with context
      if (repository && repository.getStorageType() === "local") {
        await repository.addMessage(newChat.id, {
          role: "assistant",
          content: `This is a continuation of a previous conversation. Here's a brief summary:\n\n${summary}`,
        });
      }
    },

    handleDraftChange(draft: string) {
      setState((prev) => ({ ...prev, pendingMessage: draft }));
    },

    async handleShare(privacy: "shared" | "public") {
      if (!chatId) {
        throw new Error("No chat selected to share");
      }
      setState((prev) => ({ ...prev, showShareModal: false }));
      return await actions.shareChat(chatId, privacy);
    },

    handleRequestDeleteChat(id: string) {
      // Set up undo banner
      setState((prev) => ({
        ...prev,
        undoBanner: {
          type: "chat",
          id,
          expiresAt: Date.now() + 5000, // 5 seconds to undo
        },
      }));

      // Delete after timeout
      setTimeout(() => {
        setState((prev) => {
          if (prev.undoBanner?.id === id) {
            actions.deleteChat(id);
            return { ...prev, undoBanner: undefined };
          }
          return prev;
        });
      }, 5000);
    },

    handleRequestDeleteMessage(id: string) {
      // Set up undo banner
      setState((prev) => ({
        ...prev,
        undoBanner: {
          type: "message",
          id,
          expiresAt: Date.now() + 5000,
        },
      }));

      // Delete after timeout
      setTimeout(() => {
        setState((prev) => {
          if (prev.undoBanner?.id === id) {
            actions.deleteMessage(id);
            return { ...prev, undoBanner: undefined };
          }
          return prev;
        });
      }, 5000);
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
      setState((prev) => {
        const history = [...prev.userHistory];
        // Remove duplicate if it exists
        const index = history.indexOf(message);
        if (index > -1) {
          history.splice(index, 1);
        }
        // Add to beginning
        history.unshift(message);
        // Keep only last 50 items
        if (history.length > 50) {
          history.pop();
        }
        return { ...prev, userHistory: history };
      });
    },
  };

  return {
    state,
    actions,
    isAuthenticated,
    repository,
  };
}
