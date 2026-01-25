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
import type { PersistedPayload } from "../lib/types/message";
import { logger } from "../lib/logger";
import { updateLastAssistantMessage } from "./utils/messageStateUpdaters";
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

        let fullContent = "";
        let accumulatedReasoning = "";
        let persistedDetails: PersistedPayload | null = null;
        let persistedConfirmed = false;

        for await (const chunk of generator) {
          switch (chunk.type) {
            case "progress":
              // Update searchProgress with all stage information including tool reasoning
              setState((prev) => ({
                ...prev,
                searchProgress: {
                  stage: chunk.stage,
                  message: chunk.message,
                  urls: chunk.urls,
                  currentUrl: chunk.currentUrl,
                  queries: chunk.queries,
                  sourcesUsed: chunk.sourcesUsed,
                  // Model-agnostic reasoning from tool schema
                  toolReasoning: chunk.toolReasoning,
                  toolQuery: chunk.toolQuery,
                  toolUrl: chunk.toolUrl,
                },
              }));
              logger.debug("Progress update:", chunk.stage, chunk.message, {
                toolReasoning: chunk.toolReasoning,
                toolQuery: chunk.toolQuery,
              });
              break;

            case "reasoning":
              // Accumulate reasoning/thinking content
              accumulatedReasoning += chunk.content;
              updateLastAssistantMessage(setState, {
                reasoning: accumulatedReasoning,
                thinking: "Thinking...",
              });
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
                updateLastAssistantMessage(
                  setState,
                  { content: fullContent, isStreaming: true },
                  {
                    searchProgress: {
                      stage: "generating",
                      message: "Writing answer...",
                    },
                  },
                );
              }
              break;

            case "metadata": {
              if (chunk.metadata && typeof chunk.metadata === "object") {
                const metadata = chunk.metadata as Record<string, unknown>;
                const workflowIdFromMetadata = metadata.workflowId as
                  | string
                  | undefined;
                const contextRefs = Array.isArray(metadata.contextReferences)
                  ? (metadata.contextReferences as UnifiedMessage["contextReferences"])
                  : undefined;
                const metadataSources = Array.isArray(metadata.sources)
                  ? (metadata.sources as string[])
                  : undefined;
                const searchResults = contextRefs
                  ? contextRefs.map((ref) => ({
                      title:
                        ref.title ||
                        (ref.url ? new URL(ref.url).hostname : "Unknown"),
                      url: ref.url || "",
                      snippet: "",
                      relevanceScore: ref.relevanceScore ?? 0.5,
                      kind: ref.type,
                    }))
                  : metadata.searchResults || [];

                // Build message updates with only defined values
                // CRITICAL: Keep isStreaming=true until persisted event fires
                const messageUpdates: Partial<UnifiedMessage> = {
                  isStreaming: true,
                  thinking: undefined,
                  searchResults:
                    searchResults as UnifiedMessage["searchResults"],
                };
                if (workflowIdFromMetadata !== undefined) {
                  messageUpdates.workflowId = workflowIdFromMetadata;
                }
                const nonce = (chunk as { nonce?: string }).nonce;
                if (nonce !== undefined) {
                  messageUpdates.workflowNonce = nonce;
                }
                if (contextRefs !== undefined) {
                  messageUpdates.contextReferences = contextRefs;
                }
                if (metadataSources !== undefined) {
                  messageUpdates.sources = metadataSources;
                }
                updateLastAssistantMessage(setState, messageUpdates);
              }
              logger.debug("Metadata received");
              break;
            }

            case "error":
              throw new Error(chunk.error);

            case "done":
            case "complete":
              // Indicate finalizing while waiting for persisted confirmation
              updateLastAssistantMessage(
                setState,
                { isStreaming: true, thinking: undefined },
                {
                  searchProgress: {
                    stage: "finalizing",
                    message: "Saving and securing results...",
                  },
                },
              );
              logger.debug("Stream complete, awaiting persisted event...");
              break;

            case "persisted": {
              persistedConfirmed = true;
              persistedDetails = chunk.payload;
              // Build message updates with pre-computed transformations
              const persistedSearchResults = chunk.payload.contextReferences
                ?.filter((ref) => ref && typeof ref.url === "string")
                .map((ref) => ({
                  title: ref.title || ref.url || "Unknown",
                  url: ref.url || "",
                  snippet: "",
                  relevanceScore: ref.relevanceScore ?? 0.5,
                  kind: ref.type,
                }));
              const messageUpdates: Partial<UnifiedMessage> = {
                workflowId: chunk.payload.workflowId,
                sources: chunk.payload.sources,
                contextReferences: chunk.payload.contextReferences,
                isStreaming: false,
                thinking: undefined,
                persisted: true,
              };
              // Only include optional fields if defined
              if (chunk.nonce !== undefined) {
                messageUpdates.workflowNonce = chunk.nonce;
              }
              if (chunk.signature !== undefined) {
                messageUpdates.workflowSignature = chunk.signature;
              }
              if (persistedSearchResults !== undefined) {
                messageUpdates.searchResults = persistedSearchResults;
              }
              updateLastAssistantMessage(setState, messageUpdates, {
                isGenerating: false,
                searchProgress: { stage: "idle" },
              });
              logger.debug("Persistence confirmed via SSE", {
                chatId,
                workflowId: chunk.payload.workflowId,
              });
              break;
            }
          }
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

          // The code below is disabled to prevent flickering
          // If needed in the future, we need to merge DB messages with optimistic state
          // instead of replacing entirely

          /*
          if (!shouldForce) {
            logger.debug("Skipping refresh - persistence not confirmed", { chatId });
            return;
          }
          */

          const maxAttempts = 5;
          const delay = (ms: number) =>
            new Promise((resolve) => setTimeout(resolve, ms));
          const targetAssistantId = persistedDetails
            ? IdUtils.toUnifiedId(persistedDetails.assistantMessageId)
            : null;
          const trimmedAnswer = fullContent.trim();
          if (!persistedDetails) {
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
                  persistedDetails?.workflowId &&
                  m.workflowId === persistedDetails.workflowId
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

                // CRITICAL: Only update if DB messages are actually different
                // This prevents flickering when optimistic state is already correct
                setState((prev) => {
                  // Check if we already have the correct messages (optimistic state)
                  const hasOptimisticState = prev.messages.some(
                    (m) =>
                      m.role === "assistant" &&
                      m.content === trimmedAnswer &&
                      m.persisted === true,
                  );

                  if (hasOptimisticState) {
                    logger.debug(
                      "Skipping refresh - optimistic state already correct",
                      { chatId },
                    );
                    // Don't replace messages - optimistic state is already good
                    return prev;
                  }

                  // Messages from DB are different - do the update
                  return {
                    ...prev,
                    messages,
                    currentChatId: chatId,
                    currentChat:
                      prev.chats.find((c) => c.id === chatId) ||
                      prev.currentChat,
                  };
                });
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
