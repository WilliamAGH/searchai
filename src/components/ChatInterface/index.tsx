/**
 * Main chat interface - orchestrates chats/messages for all users
 * Refactored to use sub-components for better organization
 */

import { useAction, useMutation } from "convex/react";
import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";
import { useUnifiedChat } from "../../hooks/useUnifiedChat";
import { useChatNavigation } from "../../hooks/useChatNavigation";
import { useDraftAnalyzer } from "../../hooks/useDraftAnalyzer";
import { useMessageHandler } from "../../hooks/useMessageHandler";
import { useEnhancedFollowUpPrompt } from "../../hooks/useEnhancedFollowUpPrompt";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useComponentProps } from "../../hooks/useComponentProps";
import { useDeletionHandlers } from "../../hooks/useDeletionHandlers";
import { useAnonymousSession } from "../../hooks/useAnonymousSession";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useUrlStateSync } from "../../hooks/useUrlStateSync";
import { useMetaTags } from "../../hooks/useMetaTags";
import { useAutoCreateFirstChat } from "../../hooks/useAutoCreateFirstChat";
import { useConvexQueries } from "../../hooks/useConvexQueries";
import { useSidebarTiming } from "../../hooks/useSidebarTiming";
import { usePaginatedMessages } from "../../hooks/usePaginatedMessages";
import { logger } from "../../lib/logger";
import { ChatLayout } from "./ChatLayout";
import type { Chat } from "../../lib/types/chat";
import { createChatFromData } from "../../lib/types/chat";
import { DRAFT_MIN_LENGTH } from "../../lib/constants/topicDetection";
import {
  buildApiBase,
  resolveApiPath,
  fetchJsonWithRetry,
} from "../../lib/utils/httpUtils";
import { isTopicChange } from "../../lib/utils/topicDetection";
import { mapMessagesToLocal } from "../../lib/utils/messageMapper";
import { buildUserHistory } from "../../lib/utils/chatHistory";

function ChatInterfaceComponent({
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
  // aiService removed - no longer needed with unified flow

  const unified = useUnifiedChat();
  const chatState = unified;
  const chatActions = unified;
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
  const sessionId = useAnonymousSession();

  const userSelectedChatAtRef = useRef<number | null>(null);
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteMessage = useMutation(api.messages.deleteMessage);

  // Get all chats (either from Convex or local storage)
  const allChats = useMemo(() => {
    let baseChats: Chat[] = [];

    // The unified hook handles both authenticated and unauthenticated states
    // Convert from unified format to local format for compatibility
    if (chats && chats.length > 0) {
      baseChats = chats.map((chat) =>
        createChatFromData({
          _id: chat.id || chat._id,
          title: chat.title,
          createdAt: chat.createdAt,
          updatedAt: chat.updatedAt,
          privacy: chat.privacy,
          shareId: chat.shareId,
          publicId: chat.publicId,
          userId: chat.userId,
          _creationTime: chat._creationTime,
        }),
      );
    }

    return baseChats;
  }, [chats]);

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
    sessionId: sessionId || undefined,
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

  // Use paginated messages for authenticated users with Convex chats
  const {
    messages: paginatedMessages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    hasMore,
    error: loadError,
    retryCount,
    loadMore,
    refresh: _refreshMessages,
    clearError,
  } = usePaginatedMessages({
    chatId:
      isAuthenticated && currentChatId && !currentChat?.isLocal
        ? currentChatId
        : null,
    initialLimit: 50,
    enabled: isAuthenticated && !!currentChatId && !currentChat?.isLocal,
  });

  const handlePaginatedLoadMore = useCallback(async () => {
    await loadMore();
  }, [loadMore]);

  // Use paginated messages when available, fallback to regular messages
  // CRITICAL: Prioritize unified messages during active generation (optimistic state)
  const effectiveMessages = useMemo(() => {
    // Check if unified messages have optimistic state (isStreaming or unpersisted)
    const hasOptimisticMessages = messages.some(
      (m) => m.isStreaming === true || m.persisted === false,
    );

    const lastAssistantMessage = [...messages]
      .reverse()
      .find((m) => m.role === "assistant");
    // Extract stable ID from the last assistant message (prefer messageId > _id > id)
    const lastAssistantKey =
      lastAssistantMessage?.messageId ??
      lastAssistantMessage?._id ??
      lastAssistantMessage?.id ??
      null;
    const persistedAssistantMissingInPaginated =
      !!lastAssistantMessage &&
      lastAssistantMessage.persisted === true &&
      !lastAssistantMessage.isStreaming &&
      typeof lastAssistantMessage.content === "string" &&
      lastAssistantMessage.content.length > 0 &&
      // Use ID-based comparison when available, fall back to content comparison
      (lastAssistantKey
        ? !paginatedMessages.some(
            (m) => (m.messageId ?? m._id ?? m.id ?? null) === lastAssistantKey,
          )
        : !paginatedMessages.some(
            (m) =>
              m.role === "assistant" &&
              typeof m.content === "string" &&
              m.content === lastAssistantMessage.content,
          ));

    // If we have optimistic messages (or a just-persisted message not yet in paginated),
    // always use unified messages (source of truth during generation)
    if (hasOptimisticMessages || persistedAssistantMissingInPaginated) {
      logger.debug("Using unified messages - optimistic state present", {
        count: messages.length,
        chatId: currentChatId,
      });
      return messages;
    }

    // Otherwise, use paginated messages if available (for authenticated users with DB data)
    if (
      isAuthenticated &&
      currentChatId &&
      !currentChat?.isLocal &&
      paginatedMessages.length > 0
    ) {
      logger.debug("Using paginated messages - no optimistic state", {
        count: paginatedMessages.length,
        chatId: currentChatId,
      });
      return paginatedMessages;
    }

    // Fallback to unified messages
    logger.debug("Using unified messages - fallback", {
      count: messages.length,
      chatId: currentChatId,
    });
    return messages;
  }, [
    isAuthenticated,
    currentChatId,
    currentChat?.isLocal,
    paginatedMessages,
    messages,
  ]);

  const currentMessages = useMemo(
    () => mapMessagesToLocal(effectiveMessages, isAuthenticated),
    [effectiveMessages, isAuthenticated],
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

  // Unified flow: Use chatActions.sendMessage for all message handling
  // The repository layer handles both authenticated and anonymous users
  const generateUnauthenticatedResponse = useCallback(
    async (message: string, chatId: string) => {
      // Use the unified chat actions sendMessage method
      if (chatActions.sendMessage) {
        await chatActions.sendMessage(chatId, message);
      } else {
        logger.error("sendMessage not available in chatActions");
      }
    },
    [chatActions],
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
    generateResponse: async (args: { chatId: string; message: string }) => {
      if (!chatActions.sendMessage) {
        throw new Error("Message sending is currently unavailable.");
      }

      await chatActions.sendMessage(args.chatId, args.message);
    },
    generateUnauthenticatedResponse,
    maybeShowFollowUpPrompt,
    chatActions,
    setErrorMessage: chatActions.setError,
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
    isLoading: chatState.isLoading, // Prevent creation while loading existing chats
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
    // Pagination props
    isLoadingMore,
    hasMore,
    onLoadMore: handlePaginatedLoadMore,
    isLoadingMessages,
    loadError,
    retryCount,
    onClearError: clearError,
  });

  return (
    <ChatLayout
      sidebarOpen={sidebarOpen}
      isMobile={isMobile}
      showShareModal={showShareModal}
      showFollowUpPrompt={showFollowUpPrompt}
      currentChatId={currentChatId}
      currentChat={currentChat}
      isAuthenticated={isAuthenticated}
      allChats={allChats}
      undoBanner={undoBanner}
      plannerHint={plannerHint}
      chatSidebarProps={chatSidebarProps}
      mobileSidebarProps={mobileSidebarProps}
      messageListProps={messageListProps}
      messageInputProps={messageInputProps}
      swipeHandlers={swipeHandlers}
      setShowShareModal={setShowShareModal}
      setUndoBanner={setUndoBanner}
      openShareModal={openShareModal}
      handleContinueChat={handleContinueChat}
      handleNewChatForFollowUp={handleNewChatForFollowUp}
      handleNewChatWithSummary={handleNewChatWithSummary}
      chatState={chatState}
      chatActions={chatActions}
      updateChatPrivacy={updateChatPrivacy}
      navigateWithVerification={navigateWithVerification}
      buildChatPath={buildChatPath}
      fetchJsonWithRetry={fetchJsonWithRetry}
      resolveApi={resolveApi}
    />
  );
}

export const ChatInterface = React.memo(ChatInterfaceComponent);
export default ChatInterface;
