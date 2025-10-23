/**
 * Chat Actions Hook
 * Provides all chat-related actions and operations
 */

import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "../lib/repositories/ChatRepository";
import type { ChatState } from "./useChatState";
import type { UnifiedChat, UnifiedMessage } from "../lib/types/unified";
import { TitleUtils, IdUtils } from "../lib/types/unified";
import type { PersistedPayload } from "../lib/types/message";
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
        // Ensure currentChatId and currentChat match the chat we're sending to
        currentChatId: chatId,
        currentChat:
          prev.chats.find((c) => c.id === chatId) || prev.currentChat,
        messages: [...prev.messages, userMessage, assistantPlaceholder],
      }));

      try {
        // Send message and get streaming response
        const generator = repository.generateResponse(chatId, content);

        let fullContent = "";
        let accumulatedReasoning = "";
        let persistedPayload: PersistedPayload | null = null;

        for await (const chunk of generator) {
          switch (chunk.type) {
            case "progress":
              // Update searchProgress with all stage information
              setState((prev) => ({
                ...prev,
                searchProgress: {
                  stage: chunk.stage,
                  message: chunk.message,
                  urls: chunk.urls,
                  currentUrl: chunk.currentUrl,
                  queries: chunk.queries,
                  sourcesUsed: chunk.sourcesUsed,
                },
              }));
              logger.debug("Progress update:", chunk.stage, chunk.message);
              break;

            case "reasoning":
              // Accumulate reasoning/thinking content
              accumulatedReasoning += chunk.content;
              setState((prev) => ({
                ...prev,
                messages: prev.messages.map((m, index) =>
                  index === prev.messages.length - 1 && m.role === "assistant"
                    ? {
                        ...m,
                        reasoning: accumulatedReasoning,
                        thinking: "Thinking...",
                      }
                    : m,
                ),
              }));
              logger.debug("Reasoning chunk received");
              break;

            case "content":
            case "chunk":
              // Accumulate answer content (handle both "content" and legacy "chunk")
              const delta =
                chunk.type === "content" && "delta" in chunk
                  ? chunk.delta
                  : chunk.content;
              if (delta) {
                fullContent += delta;
                // Update last assistant message with streaming content
                setState((prev) => ({
                  ...prev,
                  messages: prev.messages.map((m, index) =>
                    index === prev.messages.length - 1 && m.role === "assistant"
                      ? {
                          ...m,
                          content: fullContent,
                          isStreaming: true,
                        }
                      : m,
                  ),
                  searchProgress: {
                    stage: "generating",
                    message: "Writing answer...",
                  },
                }));
              }
              break;

            case "metadata":
              // Apply final metadata (sources, searchResults, etc.)
              if (chunk.metadata && typeof chunk.metadata === "object") {
                const metadata = chunk.metadata as Record<string, unknown>;

                // Convert contextReferences to searchResults for UI compatibility
                const searchResults = Array.isArray(metadata.contextReferences)
                  ? metadata.contextReferences.map((ref: unknown) => {
                      const contextRef = ref as {
                        title?: string;
                        url?: string;
                        relevanceScore?: number;
                        relevance?: string;
                        type?: string;
                      };
                      return {
                        title:
                          contextRef.title ||
                          (contextRef.url
                            ? new URL(contextRef.url).hostname
                            : "Unknown"),
                        url: contextRef.url || "",
                        snippet: "",
                        relevanceScore:
                          contextRef.relevanceScore ||
                          (contextRef.relevance === "high"
                            ? 0.9
                            : contextRef.relevance === "medium"
                              ? 0.7
                              : 0.5),
                        kind: contextRef.type,
                      };
                    })
                  : metadata.searchResults || [];

                setState((prev) => ({
                  ...prev,
                  messages: prev.messages.map((m, index) =>
                    index === prev.messages.length - 1 && m.role === "assistant"
                      ? {
                          ...m,
                          ...metadata,
                          searchResults,
                          contextReferences: metadata.contextReferences,
                          isStreaming: false,
                          thinking: undefined,
                        }
                      : m,
                  ),
                }));
              }
              logger.debug("Metadata received");
              break;

            case "error":
              throw new Error(chunk.error);

            case "done":
            case "complete":
              // Stream completion - mark as not streaming but keep generating=true
              // until persist completes (to prevent premature refresh)
              setState((prev) => ({
                ...prev,
                searchProgress: { stage: "idle" },
                messages: prev.messages.map((m, index) =>
                  index === prev.messages.length - 1 && m.role === "assistant"
                    ? { ...m, isStreaming: false, thinking: undefined }
                    : m,
                ),
              }));
              logger.debug("Stream complete, waiting for persist...");
              break;

            case "persisted":
              // Persistence complete - NOW we can safely refresh
              persistedPayload = chunk.payload;
              setState((prev) => ({
                ...prev,
                isGenerating: false,
                messages: prev.messages.map((m, index) =>
                  index === prev.messages.length - 1 && m.role === "assistant"
                    ? {
                        ...m,
                        workflowId: chunk.payload.workflowId,
                        sources: chunk.payload.sources,
                        contextReferences: chunk.payload.contextReferences,
                        searchResults:
                          chunk.payload.contextReferences
                            ?.filter(
                              (ref) => ref && typeof ref.url === "string",
                            )
                            .map((ref) => ({
                              title: ref.title || ref.url || "Unknown",
                              url: ref.url || "",
                              snippet: "",
                              relevanceScore: ref.relevanceScore ?? 0.5,
                              kind: ref.type,
                            })) || m.searchResults,
                        isStreaming: false,
                        thinking: undefined,
                      }
                    : m,
                ),
              }));
              logger.debug("Persistence confirmed, triggering refresh", {
                chatId,
                workflowId: chunk.payload.workflowId,
              });
              break;
          }
        }

        const refreshAfterPersist = async () => {
          if (!repository) {
            return;
          }

          const maxAttempts = 5;
          const delay = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          const targetAssistantId = persistedPayload
            ? IdUtils.toUnifiedId(persistedPayload.assistantMessageId)
            : null;
          const trimmedAnswer = fullContent.trim();
          if (!persistedPayload) {
            logger.warn(
              "Persist payload missing; relying on content match for refresh",
              { chatId },
            );
          }

          for (let attempt = 0; attempt < maxAttempts; attempt++) {
            try {
              const messages = await repository.getMessages(chatId);
              const hasUserMessage = messages.some(
                (m) => m.role === "user" && m.content === content,
              );
              const hasAssistantMessage = messages.some((m) => {
                if (m.role !== "assistant") return false;
                if (targetAssistantId && m.id === targetAssistantId) {
                  return true;
                }
                if (
                  persistedPayload?.workflowId &&
                  m.workflowId === persistedPayload.workflowId
                ) {
                  return true;
                }
                const normalizedContent = (m.content || "").trim();
                if (trimmedAnswer.length === 0) {
                  return normalizedContent.length === 0;
                }
                return normalizedContent === trimmedAnswer;
              });

              if (hasUserMessage && hasAssistantMessage) {
                logger.debug("Messages refreshed after persistence", {
                  chatId,
                  messageCount: messages.length,
                  attempt,
                });

                setState((prev) => ({
                  ...prev,
                  messages,
                  currentChatId: chatId,
                  currentChat:
                    prev.chats.find((c) => c.id === chatId) || prev.currentChat,
                }));
                return;
              }
            } catch (error) {
              logger.error("Failed to refresh messages after persistence:", {
                chatId,
                error,
              });
            }

            await delay(150 * (attempt + 1));
          }

          logger.warn(
            "Persisted messages not visible after retries; retaining optimistic state",
            { chatId },
          );
        };

        await refreshAfterPersist();
      } catch (error) {
        logger.error("Failed to send message:", error);
        setState((prev) => ({
          ...prev,
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
