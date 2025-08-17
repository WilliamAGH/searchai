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
import { isConvexChatId } from "../../lib/utils/id";
import { useUnifiedChat } from "../../hooks/useUnifiedChat";
import { useNavigate } from "react-router-dom";
import { useChatNavigation } from "../../hooks/useChatNavigation";
import { useDraftAnalyzer } from "../../hooks/useDraftAnalyzer";
import { useMessageHandler } from "../../hooks/useMessageHandler";
import { useEnhancedFollowUpPrompt } from "../../hooks/useEnhancedFollowUpPrompt";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";
import { useComponentProps } from "../../hooks/useComponentProps";
import { useDeletionHandlers } from "../../hooks/useDeletionHandlers";
import { useIsMobile } from "../../hooks/useIsMobile";
import { useUrlStateSync } from "../../hooks/useUrlStateSync";
import { useMetaTags } from "../../hooks/useMetaTags";
import { useAutoCreateFirstChat } from "../../hooks/useAutoCreateFirstChat";
import { useConvexQueries } from "../../hooks/useConvexQueries";
import { useSidebarTiming } from "../../hooks/useSidebarTiming";
import { usePaginatedMessages } from "../../hooks/usePaginatedMessages";
import { logger } from "../../lib/logger";
import { ChatLayout } from "./ChatLayout";
import { toast } from "sonner";
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
import { ANON_SESSION_KEY } from "../../lib/constants/session";
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
  const navigate = useNavigate();
  const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
  const apiBase = buildApiBase(convexUrl);
  const resolveApi = useCallback(
    (path: string) => resolveApiPath(apiBase, path),
    [apiBase],
  );

  const [localIsGenerating, setIsGenerating] = useState(false);
  const [publicChatCheckComplete, setPublicChatCheckComplete] = useState(false);
  // aiService removed - no longer needed with unified flow

  const unified = useUnifiedChat();
  const chatState = unified;
  const chatActions = unified;
  const isServiceAvailable = !!unified.repository;
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

    logger.debug(
      "[CHAT_INTERFACE] Building allChats from:",
      chats.length,
      "chats",
    );
    logger.debug(
      "[CHAT_INTERFACE] Current sessionId:",
      (window as unknown as { sessionId?: string }).sessionId ||
        localStorage.getItem(ANON_SESSION_KEY),
    );
    logger.debug("[CHAT_INTERFACE] Is authenticated:", isAuthenticated);
    logger.debug(
      "[CHAT_INTERFACE] Raw chats:",
      chats.map((c) => ({
        id: c.id,
        _id: (c as unknown as { _id?: string })._id,
        title: c.title,
        sessionId: (c as unknown as { sessionId?: string }).sessionId,
      })),
    );

    // The unified hook handles both authenticated and unauthenticated states
    // Convert from unified format to local format for compatibility
    if (chats && chats.length > 0) {
      baseChats = chats.map((chat) =>
        createChatFromData(
          {
            // CRITICAL: Use the unified 'id' field as _id to ensure uniqueness
            // UnifiedChat has 'id' as primary identifier
            _id: chat.id,
            id: chat.id,
            title: chat.title,
            createdAt: chat.createdAt,
            updatedAt: chat.updatedAt,
            privacy: chat.privacy,
            shareId: chat.shareId,
            publicId: chat.publicId,
            userId: chat.userId,
            _creationTime: chat._creationTime,
          },
          isAuthenticated,
        ),
      );
    }

    return baseChats;
  }, [isAuthenticated, chats]);

  const { buildChatPath, handleSelectChat: navHandleSelectChat } =
    useChatNavigation({
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

  // Handle public/shared chat selection when loaded from URL
  useEffect(() => {
    logger.debug("[CHAT_INTERFACE] URL chat selection effect:", {
      hasPublicChat: !!chatByPublicId,
      hasSharedChat: !!chatByShareId,
      hasOpaqueChat: !!chatByOpaqueId,
      currentChatId,
      publicId: propPublicId,
      shareId: propShareId,
      publicChatCheckComplete,
    });

    // Mark check as complete after queries have had time to run
    if ((propPublicId || propShareId) && !publicChatCheckComplete) {
      const timer = setTimeout(() => {
        // If we still don't have a chat after checking, it doesn't exist
        if (!chatByPublicId && !chatByShareId) {
          logger.error("[CHAT_INTERFACE] Public/shared chat not found");
          toast.error(
            propPublicId
              ? "This public chat could not be found. It may have been deleted or made private."
              : "This shared chat could not be found. It may have been deleted or the link may be invalid.",
          );
        }
        setPublicChatCheckComplete(true);
      }, 2000); // Give queries 2 seconds to complete
      return () => clearTimeout(timer);
    }

    // If we have a public chat loaded but it's not selected, select it
    if (chatByPublicId && !currentChatId) {
      logger.info(
        "[CHAT_INTERFACE] Public chat loaded, selecting:",
        chatByPublicId,
      );
      const publicChat = chatByPublicId as { _id: string; userId?: string };
      if (publicChat._id) {
        logger.info(
          "[CHAT_INTERFACE] Selecting public chat with ID:",
          publicChat._id,
        );
        // For public chats accessed via URL, add to local state if not already there
        const existingChat = chatState.chats.find(
          (c) => c.id === publicChat._id,
        );
        if (!existingChat && chatByPublicId) {
          // Add the public chat to local state for display
          const publicChatData = chatByPublicId as unknown as {
            title?: string;
          };
          if (publicChatData.title) {
            logger.info("[CHAT_INTERFACE] Adding public chat to local state");
            // Note: This is a temporary addition for display purposes
            // The chat will not persist in the user's chat list
          }
        }
        chatActions.selectChat(publicChat._id);
      }
    }
    // Similarly for shared chats
    else if (chatByShareId && !currentChatId) {
      logger.info(
        "[CHAT_INTERFACE] Shared chat loaded, selecting:",
        chatByShareId,
      );
      const sharedChat = chatByShareId as { _id: string; userId?: string };
      if (sharedChat._id) {
        logger.info(
          "[CHAT_INTERFACE] Selecting shared chat with ID:",
          sharedChat._id,
        );
        // For shared chats accessed via URL, add to local state if not already there
        const existingChat = chatState.chats.find(
          (c) => c.id === sharedChat._id,
        );
        if (!existingChat && chatByShareId) {
          const sharedChatData = chatByShareId as unknown as { title?: string };
          if (sharedChatData.title) {
            logger.info("[CHAT_INTERFACE] Adding shared chat to local state");
          }
        }
        chatActions.selectChat(sharedChat._id);
      }
    }
    // Handle regular chat ID from URL
    else if (chatByOpaqueId && !currentChatId) {
      logger.info(
        "[CHAT_INTERFACE] Opaque chat loaded, selecting:",
        chatByOpaqueId,
      );
      const opaqueChat = chatByOpaqueId as { _id: string };
      if (opaqueChat._id) {
        logger.info(
          "[CHAT_INTERFACE] Selecting opaque chat with ID:",
          opaqueChat._id,
        );
        chatActions.selectChat(opaqueChat._id);
      }
    }
  }, [
    chatByPublicId,
    chatByShareId,
    chatByOpaqueId,
    currentChatId,
    chatActions,
    chatState.chats,
    propPublicId,
    propShareId,
    publicChatCheckComplete,
  ]);

  // Determine if the current chat is read-only
  // A chat is read-only if:
  // 1. It's accessed via public/share URL AND
  // 2. The user doesn't own it (for authenticated users) OR is not authenticated
  const _isReadOnlyChat = useMemo(() => {
    // If accessing via public/share URL
    if (propPublicId || propShareId) {
      // Get the loaded chat data
      const loadedChat = chatByPublicId || chatByShareId;
      if (!loadedChat) return true; // Default to read-only if chat not loaded

      const chat = loadedChat as { userId?: string | Id<"users"> };

      // For unauthenticated users, public/shared chats are always read-only
      if (!isAuthenticated) {
        logger.debug(
          "[CHAT_INTERFACE] Read-only: unauthenticated user viewing public/shared chat",
        );
        return true;
      }

      // For authenticated users, check if they own the chat
      // Since we don't have the current user ID readily available,
      // we'll check if the chat exists in their chat list
      const userOwnsChat = chatState.chats.some((c) => {
        const chatId =
          typeof chat.userId === "string"
            ? chat.userId
            : (chat.userId as unknown as { _id?: string })?._id;
        return (
          c.id === chatId ||
          c.id === (loadedChat as unknown as { _id: string })._id
        );
      });

      if (!userOwnsChat) {
        logger.debug(
          "[CHAT_INTERFACE] Read-only: authenticated user viewing non-owned public/shared chat",
        );
        return true;
      }
    }

    return false;
  }, [
    propPublicId,
    propShareId,
    chatByPublicId,
    chatByShareId,
    isAuthenticated,
    chatState.chats,
  ]);

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
      logger.debug("[CHAT_INTERFACE] handleSelectChat called with:", id);
      logger.debug(
        "[CHAT_INTERFACE] Current chat before selection:",
        currentChatId,
      );
      userSelectedChatAtRef.current = Date.now();
      navHandleSelectChat(String(id));
      logger.debug(
        "[CHAT_INTERFACE] Called navHandleSelectChat with:",
        String(id),
      );
    },
    [navHandleSelectChat, currentChatId],
  );

  // Use paginated messages for authenticated users with Convex chats
  // CRITICAL: Only use pagination with valid Convex chat IDs (contain '|')
  // Also enable for public/shared chats accessed via URL
  const isValidConvexChatId = currentChatId && isConvexChatId(currentChatId);

  // For public/shared chats, we should still load messages even if not authenticated
  const shouldLoadMessages =
    isValidConvexChatId &&
    (isAuthenticated || // Authenticated users can always load
      propPublicId || // Public chats can be loaded by anyone
      propShareId); // Shared chats can be loaded by anyone with the link

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
    chatId: shouldLoadMessages ? currentChatId : null,
    initialLimit: 50,
    enabled: shouldLoadMessages,
  });

  // Use paginated messages when available, fallback to regular messages
  // CRITICAL: Only use ONE source of messages to prevent duplicate keys
  const effectiveMessages = useMemo(() => {
    // For users with valid Convex chats (including public/shared), use paginated messages
    if (
      shouldLoadMessages &&
      (paginatedMessages.length > 0 || isLoadingMessages)
    ) {
      return paginatedMessages;
    }
    // For everyone else (anonymous, invalid IDs), use regular messages
    return messages;
  }, [shouldLoadMessages, paginatedMessages, messages, isLoadingMessages]);

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
    _propChatId: propChatId,
    propShareId,
    propPublicId,
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
    _localChats: chatState.chats,
    _selectChat: chatActions.selectChat,
  });
  useMetaTags({ currentChatId, allChats });

  const handleNewChat = useCallback(
    async (_opts?: { userInitiated?: boolean }): Promise<string | null> => {
      if (!isServiceAvailable) {
        toast.error("Service unavailable: Cannot create new chats right now.");
        return null;
      }
      setIsCreatingChat(true);
      try {
        // Simply use the createChat action from useUnifiedChat
        const chat = await chatActions.createChat("New Chat");
        if (chat?.id) {
          // Navigate to the new chat using navHandleSelectChat
          await navHandleSelectChat(chat.id);
          setIsCreatingChat(false);
          return chat.id;
        }
      } catch (error) {
        logger.error("Failed to create chat:", error);
      }
      setIsCreatingChat(false);
      return null;
    },
    [isServiceAvailable, chatActions, navHandleSelectChat],
  );

  useEffect(() => {
    if (isCreatingChat && currentChatId) setIsCreatingChat(false);
  }, [isCreatingChat, currentChatId]);

  // Unified flow: generateResponse is now used for all users
  // The Convex action handles both authenticated and anonymous users via sessionId
  const generateUnauthenticatedResponse = useCallback(
    async (message: string, chatId: string) => {
      // This function is kept for backwards compatibility but now uses the unified flow
      // The generateResponse action will use sessionId for anonymous users
      // Only call the API if we have a valid Convex chat ID
      if (isConvexChatId(chatId)) {
        await generateResponse({
          chatId,
          message,
        });
      } else {
        console.error(
          "Cannot generate response: Invalid Convex chat ID",
          chatId,
        );
      }
    },
    [generateResponse],
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

  // Wrap send with service-availability guard
  const guardedHandleSendMessage = useCallback(
    async (message: string) => {
      if (!isServiceAvailable) {
        toast.error("Service unavailable: Cannot send messages right now.");
        return;
      }
      await handleSendMessage(message);
    },
    [isServiceAvailable, handleSendMessage],
  );

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
      if (!isServiceAvailable) {
        toast.error("Service unavailable: Cannot create new chats right now.");
        return;
      }
      // Reset state first
      userSelectedChatAtRef.current = Date.now();
      setMessageCount(0);
      resetFollowUp();
      setPendingMessage("");

      // Create the chat immediately
      const newChatId = await handleNewChat();

      if (!newChatId) {
        // Navigate to home as fallback (SPA)
        navigate("/");
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
    isReadOnly: _isReadOnlyChat,
    handleSelectChat,
    handleToggleSidebar,
    handleNewChatButton,
    startNewChatSession,
    handleDeleteLocalChat,
    handleRequestDeleteChat,
    handleDeleteLocalMessage,
    handleRequestDeleteMessage,
    handleMobileSidebarClose,
    handleSendMessage: guardedHandleSendMessage,
    handleDraftChange,
    setShowShareModal,
    userHistory,
    // Pagination props
    isLoadingMore,
    hasMore,
    onLoadMore: loadMore,
    isLoadingMessages,
    loadError,
    retryCount,
    onClearError: clearError,
    // NEW: Add streaming state for real-time updates
    streamingState: chatState.streamingState,
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
      buildChatPath={buildChatPath}
      fetchJsonWithRetry={fetchJsonWithRetry}
      resolveApi={resolveApi}
    />
  );
}

export const ChatInterface = React.memo(ChatInterfaceComponent);
export default ChatInterface;
