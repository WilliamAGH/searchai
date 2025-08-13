/**
 * Main chat interface - orchestrates chats/messages for all users
 */

import { useAction, useMutation } from "convex/react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { useUnifiedChat } from "../hooks/useUnifiedChat";
import { useChatNavigation } from "../hooks/useChatNavigation";
import { useDraftAnalyzer } from "../hooks/useDraftAnalyzer";
import { useMessageHandler } from "../hooks/useMessageHandler";
import { useEnhancedFollowUpPrompt } from "../hooks/useEnhancedFollowUpPrompt";
import { useKeyboardShortcuts } from "../hooks/useKeyboardShortcuts";
import { useComponentProps } from "../hooks/useComponentProps";
import { useDeletionHandlers } from "../hooks/useDeletionHandlers";
import { useIsMobile } from "../hooks/useIsMobile";
import { useUrlStateSync } from "../hooks/useUrlStateSync";
import { useMetaTags } from "../hooks/useMetaTags";
import type { MessageStreamChunk, SearchResult } from "../lib/types/message";
import { useAutoCreateFirstChat } from "../hooks/useAutoCreateFirstChat";
import { useConvexQueries } from "../hooks/useConvexQueries";
import { useSidebarTiming } from "../hooks/useSidebarTiming";
import { useServices } from "../hooks/useServices";
import type { Chat } from "../lib/types/chat";
import { DRAFT_MIN_LENGTH } from "../lib/constants/topicDetection";
import {
  buildApiBase,
  resolveApiPath,
  fetchJsonWithRetry,
} from "../lib/utils/httpUtils";
import { isTopicChange } from "../lib/utils/topicDetection";
import { mapMessagesToLocal } from "../lib/utils/messageMapper";
import { buildUserHistory } from "../lib/utils/chatHistory";
import { ChatSidebar } from "./ChatSidebar";
import { FollowUpPrompt } from "./FollowUpPrompt";
import { logger } from "../lib/logger";
import { MessageInput } from "./MessageInput";
import { MessageList } from "./MessageList";
import { MobileSidebar } from "./MobileSidebar";
import { ShareModalContainer } from "./ShareModalContainer";
import { UndoBanner } from "./UndoBanner";

export function ChatInterface({
  isAuthenticated,
  isSidebarOpen = false,
  onToggleSidebar,
  chatId: propChatId,
  shareId: propShareId,
  publicId: propPublicId,
  onRequestSignUp,
  onRequestSignIn: _onRequestSignIn,
}: {
  isAuthenticated: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatId?: string;
  shareId?: string;
  publicId?: string;
  onRequestSignUp?: () => void;
  onRequestSignIn?: () => void;
}) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
  const apiBase = buildApiBase(convexUrl);
  const resolveApi = useCallback(
    (path: string) => resolveApiPath(apiBase, path),
    [apiBase],
  );

  const [localIsGenerating, setIsGenerating] = useState(false);
  const { aiService } = useServices(convexUrl);

  const { state: chatState, actions: chatActions } = useUnifiedChat();
  const currentChatId = chatState.currentChatId;
  const isGenerating = chatState.isGenerating || localIsGenerating;
  const searchProgress = chatState.searchProgress;
  const currentChat = chatState.currentChat;
  const messages = chatState.messages;
  const chats = chatState.chats;

  const sidebarOpen = isSidebarOpen ?? false;
  const { handleMobileSidebarClose } = useSidebarTiming({
    sidebarOpen,
    onToggleSidebar,
  });

  const [messageCount, setMessageCount] = useState(0);
  const [showShareModal, setShowShareModal] = useState(false);
  const openShareModal = useCallback(() => {
    setShowShareModal(true);
  }, []);
  const [isCreatingChat, setIsCreatingChat] = useState(false);

  const userSelectedChatAtRef = useRef<number | null>(null);
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteMessage = useMutation(api.messages.deleteMessage);

  // Get all chats (either from Convex or local storage)
  const allChats = useMemo(() => {
    let baseChats: Chat[] = [];

    // The unified hook handles both authenticated and unauthenticated states
    // Convert from unified format to local format for compatibility
    if (chats && chats.length > 0) {
      baseChats = chats.map(
        (chat) =>
          ({
            _id: chat.id || chat._id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            privacy: chat.privacy || "private",
            shareId: chat.shareId,
            publicId: chat.publicId,
            isLocal: !isAuthenticated,
            source: isAuthenticated ? "convex" : "local",
            userId: chat.userId,
          }) as Chat,
      );
    }

    return baseChats;
  }, [isAuthenticated, chats]);

  const {
    navigateWithVerification,
    buildChatPath,
    handleSelectChat: navHandleSelectChat,
  } = useChatNavigation({
    currentChatId,
    allChats,
    isAuthenticated,
    onSelectChat: chatActions.selectChat,
  });
  const updateChatPrivacy = useMutation(api.chats.updateChatPrivacy);
  const generateResponse = useAction(api.ai.generateStreamingResponse);
  const planSearch = useAction(api.search.planSearch);
  const recordClientMetric = useAction(api.search.recordClientMetric);
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);

  const { chatByOpaqueId, chatByShareId, chatByPublicId } = useConvexQueries({
    isAuthenticated,
    propChatId,
    propShareId,
    propPublicId,
    currentChatId,
  });

  // Use deletion handlers hook for all deletion operations
  const {
    handleDeleteLocalChat,
    handleRequestDeleteChat,
    handleDeleteLocalMessage,
    handleRequestDeleteMessage,
    undoBanner,
    setUndoBanner,
  } = useDeletionHandlers({
    chatState,
    chatActions,
    deleteChat,
    deleteMessage,
  });

  const [lastPlannerCallAtByChat, setLastPlannerCallAtByChat] = useState<
    Record<string, number>
  >({});

  const handleSelectChat = useCallback(
    (id: Id<"chats"> | string) => {
      userSelectedChatAtRef.current = Date.now();
      navHandleSelectChat(String(id));
    },
    [navHandleSelectChat],
  );

  const currentMessages = useMemo(
    () => mapMessagesToLocal(messages, isAuthenticated),
    [messages, isAuthenticated],
  );
  const userHistory = useMemo(
    () => buildUserHistory(currentMessages),
    [currentMessages],
  );

  useUrlStateSync({
    currentChatId,
    isAuthenticated,
    propChatId,
    propShareId,
    propPublicId,
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
    localChats: chatState.chats,
    selectChat: chatActions.selectChat,
    userSelectedChatAtRef,
  });
  useMetaTags({ currentChatId, allChats });

  const handleNewChat = useCallback(
    async (_opts?: { userInitiated?: boolean }): Promise<string | null> => {
      setIsCreatingChat(true);
      try {
        // Simply use the createChat action from useUnifiedChat
        const chat = await chatActions.createChat("New Chat");
        if (chat?.id) {
          // Navigate to the new chat
          await navigateWithVerification(`/chat/${chat.id}`);
          setIsCreatingChat(false);
          return chat.id;
        }
      } catch (error) {
        logger.error("Failed to create chat:", error);
      }
      setIsCreatingChat(false);
      return null;
    },
    [chatActions, navigateWithVerification],
  );

  useEffect(() => {
    if (isCreatingChat && currentChatId) setIsCreatingChat(false);
  }, [isCreatingChat, currentChatId]);

  // Removed throttledMessageUpdate - no longer needed with SSE streaming
  // The unauthenticated AI service now handles streaming directly

  const abortControllerRef = useRef<AbortController | null>(null);
  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      aiService?.abort();
    },
    [aiService],
  );

  // Generate AI response for unauthenticated users
  const generateUnauthenticatedResponse = useCallback(
    async (message: string, chatId: string) => {
      try {
        // Create assistant message to track streaming
        const assistantMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatId,
          role: "assistant" as const,
          content: "",
          timestamp: Date.now(),
          source: "local" as const,
          synced: false,
          isStreaming: true,
          hasStartedContent: false,
        };
        chatActions.addMessage(assistantMessage);

        // Generate response with proper parameters
        await aiService?.generateResponse(
          message,
          chatId,
          (chunk: MessageStreamChunk) => {
            // Handle SSE chunks from the backend
            if (chunk && chunk.type === "chunk" && chunk.content) {
              chatActions.updateMessage(assistantMessage.id, {
                content: (assistantMessage.content || "") + chunk.content,
                hasStartedContent: true,
                searchResults: (chunk.metadata?.searchResults ??
                  []) as SearchResult[],
                sources: (chunk.metadata?.sources ?? []) as string[],
              });
              assistantMessage.content =
                (assistantMessage.content || "") + chunk.content;
            }
          },
          [], // searchResults
          [], // sources
          chatState.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })), // chatHistory
        );

        // Mark message as done streaming
        chatActions.updateMessage(assistantMessage.id, {
          isStreaming: false,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        logger.error("AI generation failed:", error);
      }
    },
    [chatState.messages, chatActions, aiService],
  );

  const sendRefTemp = useRef<((message: string) => Promise<void>) | null>(null);
  const {
    showFollowUpPrompt,
    pendingMessage: _pendingMessage,
    plannerHint,
    resetFollowUp,
    maybeShowFollowUpPrompt,
    setPendingMessage,
    handleContinueChat,
    handleNewChatForFollowUp,
    handleNewChatWithSummary,
  } = useEnhancedFollowUpPrompt({
    isAuthenticated,
    currentChatId,
    handleNewChat,
    sendRef: sendRefTemp,
    recordClientMetric,
    summarizeRecentAction,
    chatState,
  });

  // Use the message handler hook with race condition fixes
  const { handleSendMessage, sendRef } = useMessageHandler({
    // State
    isGenerating,
    currentChatId,
    showFollowUpPrompt,
    isAuthenticated,
    messageCount,
    messages,
    chatState,
    lastPlannerCallAtByChat,

    // Actions
    setIsGenerating,
    setMessageCount,
    setLastPlannerCallAtByChat,
    setPendingMessage,

    // Functions
    handleNewChat,
    resetFollowUp,
    onRequestSignUp,
    planSearch,
    isTopicChange,
    generateResponse,
    generateUnauthenticatedResponse,
    maybeShowFollowUpPrompt,
    chatActions,
  });

  useEffect(() => {
    sendRefTemp.current = sendRef.current;
  }, [sendRef]);
  const { handleDraftChange: analyzeDraft } = useDraftAnalyzer({
    minLength: DRAFT_MIN_LENGTH,
    debounceMs: 1200,
    onAnalysis: () => {},
  });
  const handleDraftChange = useCallback(
    (draft: string) => {
      if (!isGenerating) analyzeDraft(draft);
    },
    [isGenerating, analyzeDraft],
  );

  // Auto-create first chat for new users
  // Auto-create first chat for new users
  useAutoCreateFirstChat({
    allChats,
    chats,
    currentChatId,
    isAuthenticated,
    isCreatingChat,
    propChatId,
    propShareId,
    propPublicId,
    handleNewChat,
    userSelectedChatAtRef,
  });

  // Track if we're on mobile for rendering decisions
  const isMobile = useIsMobile(1024);

  // Keyboard shortcuts and interaction handlers
  const {
    swipeHandlers,
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
  } = useKeyboardShortcuts({
    isMobile,
    sidebarOpen,
    onToggleSidebar,
    onNewChat: async () => {
      // Reset state first
      userSelectedChatAtRef.current = Date.now();
      setMessageCount(0);
      resetFollowUp();
      setPendingMessage("");

      // Create the chat immediately
      const newChatId = await handleNewChat();

      if (!newChatId) {
        // Navigate to home as fallback
        await navigateWithVerification("/").catch(() => {
          window.location.href = "/";
        });
      }
    },
    onShare: openShareModal,
  });

  // Prepare props for all child components
  const {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
  } = useComponentProps({
    allChats,
    currentChatId,
    currentChat,
    currentMessages,
    sidebarOpen,
    isMobile,
    isGenerating,
    searchProgress,
    isCreatingChat,
    showShareModal,
    isAuthenticated,
    handleSelectChat,
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
    handleDeleteLocalChat,
    handleRequestDeleteChat,
    handleDeleteLocalMessage,
    handleRequestDeleteMessage,
    handleMobileSidebarClose,
    handleSendMessage,
    handleDraftChange,
    setShowShareModal,
    userHistory,
  });

  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Desktop Sidebar */}
      {sidebarOpen && (
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <ChatSidebar {...chatSidebarProps} />
          </div>
        </div>
      )}

      {/* Mobile Sidebar */}
      {sidebarOpen && isMobile && <MobileSidebar {...mobileSidebarProps} />}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col h-full ${!sidebarOpen || isMobile ? "max-w-4xl mx-auto w-full" : ""}`}
        {...swipeHandlers}
      >
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList key={String(currentChatId)} {...messageListProps} />
        </div>
        <div className="flex-shrink-0 relative">
          {showFollowUpPrompt && (
            <div aria-hidden="true" className="h-12 sm:h-12" />
          )}
          <FollowUpPrompt
            isOpen={showFollowUpPrompt}
            onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
            hintReason={plannerHint?.reason}
            hintConfidence={plannerHint?.confidence}
          />

          {/* Inline Share button to open ShareModal (targeted by E2E tests) */}
          <div className="absolute right-3 bottom-[4.5rem] sm:bottom-[4.75rem]">
            <button
              type="button"
              onClick={openShareModal}
              className="hidden sm:inline-flex h-8 items-center justify-center px-3 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 rounded-md transition-colors"
              aria-label="Share this conversation"
              title="Share this conversation"
            >
              Share
            </button>
          </div>
          {undoBanner && (
            <UndoBanner
              type={undoBanner.message.includes("Chat") ? "chat" : "message"}
              onUndo={() => {
                undoBanner.action?.();
                setUndoBanner(null);
              }}
            />
          )}
          <MessageInput key={currentChatId || "root"} {...messageInputProps} />
        </div>
      </div>

      <ShareModalContainer
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        currentChatId={currentChatId}
        currentChat={currentChat}
        allChats={allChats}
        isAuthenticated={isAuthenticated}
        chatState={chatState}
        chatActions={chatActions}
        updateChatPrivacy={updateChatPrivacy}
        navigateWithVerification={navigateWithVerification}
        buildChatPath={buildChatPath}
        fetchJsonWithRetry={fetchJsonWithRetry}
        resolveApi={resolveApi}
      />
    </div>
  );
}

export default ChatInterface;
