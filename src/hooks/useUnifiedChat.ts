/**
 * Unified Chat Hook
 * Provides a single interface for chat operations regardless of auth status
 * Automatically handles repository selection and migration
 */

import { useState, useMemo, useEffect, useRef } from "react";
import { useConvexAuth, useClient } from "convex/react";
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
}

export interface ChatActions {
  // Chat management
  createChat: (title?: string) => Promise<UnifiedChat>;
  selectChat: (id: string | null) => Promise<void>;
  deleteChat: (id: string) => Promise<void>;
  updateChatTitle: (id: string, title: string) => Promise<void>;

  // Message operations
  sendMessage: (content: string) => Promise<void>;
  deleteMessage: (id: string) => Promise<void>;

  // Sharing
  shareChat: (
    id: string,
    privacy: "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string }>;

  // Utility
  refreshChats: () => Promise<void>;
  clearError: () => void;
}

export function useUnifiedChat() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const convexClient = useClient();

  // Repository selection based on auth status
  const repository = useMemo<IChatRepository | null>(() => {
    if (authLoading) return null;

    if (isAuthenticated && convexClient) {
      return new ConvexChatRepository(convexClient);
    }

    return new LocalChatRepository();
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
    if (!repository || !state.currentChatId) return;

    const loadMessages = async () => {
      try {
        const messages = await repository.getMessages(state.currentChatId);
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
          if (state.currentChatId && result.mapping) {
            const newId = result.mapping.get(state.currentChatId);
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
      if (!repository || !state.currentChatId) return;

      const trimmed = content.trim();
      if (!trimmed) return;

      setState((prev) => ({
        ...prev,
        isGenerating: true,
        searchProgress: { stage: "searching", message: "Searching the web..." },
      }));

      try {
        // Add user message
        const userMessage = await repository.addMessage(state.currentChatId, {
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
          await repository.updateChatTitle(state.currentChatId, title);

          setState((prev) => {
            const updated = prev.chats.map((c) =>
              c.id === state.currentChatId
                ? { ...c, title, updatedAt: Date.now() }
                : c,
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

        // Generate AI response
        const assistantMessage: UnifiedMessage = {
          id: IdUtils.generateLocalId("msg"),
          chatId: state.currentChatId,
          role: "assistant",
          content: "",
          timestamp: Date.now(),
          source: repository.getStorageType() === "convex" ? "convex" : "local",
          synced: repository.getStorageType() === "convex",
          isStreaming: true,
        };

        setState((prev) => ({
          ...prev,
          messages: [...prev.messages, assistantMessage],
        }));

        // Stream response
        const stream = repository.generateResponse(
          state.currentChatId,
          trimmed,
        );
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
  };

  return {
    state,
    actions,
    isAuthenticated,
    repository,
  };
}
