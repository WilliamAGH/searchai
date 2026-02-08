/** Main chat interface - orchestrates chats/messages for all users. */
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
import { useUnifiedChat } from "@/hooks/useUnifiedChat";
import { useChatNavigation } from "@/hooks/useChatNavigation";
import { useDraftAnalyzer } from "@/hooks/useDraftAnalyzer";
import { useMessageHandler } from "@/hooks/useMessageHandler";
import { useEnhancedFollowUpPrompt } from "@/hooks/useEnhancedFollowUpPrompt";
import { useKeyboardShortcuts } from "@/hooks/useKeyboardShortcuts";
import { useComponentProps } from "@/hooks/useComponentProps";
import { useDeletionHandlers } from "@/hooks/useDeletionHandlers";
import { useAnonymousSession } from "@/hooks/useAnonymousSession";
import { useIsMobile } from "@/hooks/useIsMobile";
import { useUrlStateSync } from "@/hooks/useUrlStateSync";
import { useMetaTags } from "@/hooks/useMetaTags";
import { useAutoCreateFirstChat } from "@/hooks/useAutoCreateFirstChat";
import { useSidebarTiming } from "@/hooks/useSidebarTiming";
import { useConvexQueries } from "@/hooks/useConvexQueries";
import { usePaginatedMessages } from "@/hooks/usePaginatedMessages";
import { useEffectiveMessages } from "@/hooks/useEffectiveMessages";
import { logger } from "@/lib/logger";
import { ChatLayout } from "@/components/ChatInterface/ChatLayout";
import type { Chat } from "@/lib/types/chat";
import { DRAFT_MIN_LENGTH } from "@/lib/constants/topicDetection";
import { buildApiBase, resolveApiPath } from "@/lib/utils/httpUtils";
import { buildUserHistory } from "@/lib/utils/chatHistory";

function ChatInterfaceComponent({
  isAuthenticated,
  isSidebarOpen = false,
  onToggleSidebar,
  chatId: propChatId,
  shareId: propShareId,
  publicId: propPublicId,
}: {
  isAuthenticated: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatId?: string;
  shareId?: string;
  publicId?: string;
}) {
  const convexUrl = import.meta.env.VITE_CONVEX_URL || "";
  const apiBase = buildApiBase(convexUrl);
  const resolveApi = useCallback(
    (path: string) => resolveApiPath(apiBase, path),
    [apiBase],
  );

  const [localIsGenerating, setIsGenerating] = useState(false);

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
  // @ts-ignore - Convex api type instantiation is too deep here
  const deleteChat = useMutation(api.chats.deleteChat);
  const deleteMessage = useMutation<typeof api.messages.deleteMessage>(
    api.messages.deleteMessage,
  );

  // Get all chats (Convex-backed only)
  const allChats = useMemo<Chat[]>(() => chats ?? [], [chats]);

  const { navigateWithVerification, handleSelectChat: navHandleSelectChat } =
    useChatNavigation({
      currentChatId,
      allChats,
      onSelectChat: chatActions.selectChat,
    });
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);

  const { chatByOpaqueId, chatByShareId, chatByPublicId } = useConvexQueries({
    propChatId,
    propShareId,
    propPublicId,
    sessionId: sessionId || undefined,
  });

  // Use deletion handlers hook for all deletion operations
  const {
    handleRequestDeleteChat,
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

  const handleSelectChat = useCallback(
    (id: Id<"chats"> | string | null) => {
      userSelectedChatAtRef.current = Date.now();
      if (!id) {
        void chatActions.selectChat(null);
        return;
      }
      void navHandleSelectChat(String(id));
    },
    [chatActions, navHandleSelectChat],
  );

  // Use paginated messages for authenticated users with Convex chats
  const usePagination = isAuthenticated && !!currentChatId;
  const {
    messages: paginatedMessages,
    isLoading: isLoadingMessages,
    isLoadingMore,
    hasMore,
    error: loadError,
    retryCount,
    loadMore,
    clearError,
  } = usePaginatedMessages({
    chatId: usePagination ? currentChatId : null,
    initialLimit: 50,
    enabled: usePagination,
  });

  const handlePaginatedLoadMore = useCallback(async () => {
    await loadMore();
  }, [loadMore]);

  // Use the extracted hook for message source selection
  const effectiveMessages = useEffectiveMessages({
    messages,
    paginatedMessages,
    currentChatId,
    preferPaginatedSource: usePagination,
    isPaginatedLoading: isLoadingMessages,
  });

  const currentMessages = effectiveMessages;
  const userHistory = useMemo(
    () => buildUserHistory(currentMessages),
    [currentMessages],
  );

  useUrlStateSync({
    currentChatId,
    propChatId,
    propShareId,
    propPublicId,
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
    selectChat: chatActions.selectChat,
  });
  useMetaTags({ currentChatId, allChats });

  const handleNewChat = useCallback(
    async (_opts?: { userInitiated?: boolean }): Promise<string | null> => {
      setIsCreatingChat(true);
      try {
        // Simply use the createChat action from useUnifiedChat
        const chat = await chatActions.createChat("New Chat");
        if (chat?._id) {
          // Navigate to the new chat
          await navigateWithVerification(String(chat._id));
          setIsCreatingChat(false);
          return chat._id;
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

  const sendRefTemp = useRef<((message: string) => Promise<void>) | null>(null);
  const {
    showFollowUpPrompt,
    plannerHint,
    resetFollowUp,
    maybeShowFollowUpPrompt,
    setPendingMessage,
    handleContinueChat,
    handleNewChatForFollowUp,
    handleNewChatWithSummary,
  } = useEnhancedFollowUpPrompt({
    currentChatId,
    handleNewChat,
    sendRef: sendRefTemp,
    summarizeRecentAction,
    chatState,
  });

  // Use the message handler hook with race condition fixes
  const { handleSendMessage, sendRef } = useMessageHandler({
    // State
    isGenerating,
    currentChatId,
    messageCount,
    chatState,

    // Actions
    setIsGenerating,
    setMessageCount,

    // Functions
    handleNewChat,
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

  // Auto-create first chat for new users (currently disabled)
  useAutoCreateFirstChat();

  // Track if we're on mobile for rendering decisions
  const isMobile = useIsMobile(1024);

  // Keyboard shortcuts and interaction handlers
  const { swipeHandlers, handleToggleSidebar, handleNewChatButton } =
    useKeyboardShortcuts({
      isMobile,
      sidebarOpen,
      onToggleSidebar,
      onNewChat: async () => {
        // Reset state first
        userSelectedChatAtRef.current = Date.now();
        setMessageCount(0);
        resetFollowUp();
        setPendingMessage("");

        // Create chat and navigate to it
        await handleNewChat({ userInitiated: true });
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
    currentMessages,
    sidebarOpen,
    isMobile,
    isGenerating,
    searchProgress,
    isCreatingChat,
    handleSelectChat,
    handleToggleSidebar,
    handleNewChatButton,
    handleRequestDeleteChat,
    handleRequestDeleteMessage,
    handleMobileSidebarClose,
    handleSendMessage,
    handleDraftChange,
    setShowShareModal,
    userHistory,
    pagination: {
      isLoadingMore,
      hasMore,
      onLoadMore: handlePaginatedLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      onClearError: clearError,
    },
  });

  return (
    <ChatLayout
      sidebarOpen={sidebarOpen}
      isMobile={isMobile}
      showShareModal={showShareModal}
      showFollowUpPrompt={showFollowUpPrompt}
      currentChatId={currentChatId}
      currentChat={currentChat}
      undoBanner={undoBanner}
      plannerHint={plannerHint}
      chatSidebarProps={chatSidebarProps}
      mobileSidebarProps={mobileSidebarProps}
      messageListProps={messageListProps}
      messageInputProps={messageInputProps}
      swipeHandlers={swipeHandlers}
      setShowShareModal={setShowShareModal}
      setUndoBanner={setUndoBanner}
      handleContinueChat={handleContinueChat}
      handleNewChatForFollowUp={handleNewChatForFollowUp}
      handleNewChatWithSummary={handleNewChatWithSummary}
      chatActions={chatActions}
      resolveApi={resolveApi}
    />
  );
}

export const ChatInterface = React.memo(ChatInterfaceComponent);
export default ChatInterface;
