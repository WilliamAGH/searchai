/** Main chat interface - orchestrates chats/messages for all users. */
import { useAction, useMutation, useQuery } from "convex/react";
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
import { IdUtils } from "@/lib/types/unified";
import { buildUserHistory } from "@/lib/utils/chatHistory";

function ChatInterfaceComponent({
  isAuthenticated,
  isSidebarOpen = false,
  onToggleSidebar,
  chatId: propChatId,
  shareId: propShareId,
  publicId: propPublicId,
}: Readonly<{
  isAuthenticated: boolean;
  isSidebarOpen?: boolean;
  onToggleSidebar?: () => void;
  chatId?: string;
  shareId?: string;
  publicId?: string;
}>) {
  const [localIsGenerating, setLocalIsGenerating] = useState(false);
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
  const {
    navigateToChat,
    navigateHome,
    handleSelectChat: navHandleSelectChat,
  } = useChatNavigation({
    currentChatId,
    allChats,
  });
  const summarizeRecentAction = useAction(api.chats.summarizeRecentAction);
  const { chatByOpaqueId, chatByShareId, chatByPublicId } = useConvexQueries({
    propChatId,
    propShareId,
    propPublicId,
    sessionId: sessionId || undefined,
  });
  const {
    handleRequestDeleteChat: requestDeleteChat,
    handleRequestDeleteMessage: requestDeleteMessage,
    undoBanner,
    setUndoBanner,
  } = useDeletionHandlers({
    chatState,
    chatActions,
    deleteChat,
    deleteMessage,
    sessionId: sessionId || undefined,
  });
  // Stable wrappers that convert async deletion handlers (Promise<void>)
  // to synchronous void, matching the useComponentProps interface.
  // These MUST be useCallback — inline arrows would break useMemo memoization.
  const handleDeleteChat = useCallback(
    (id: Id<"chats"> | string) => {
      void requestDeleteChat(id);
    },
    [requestDeleteChat],
  );
  const handleDeleteMessage = useCallback(
    (id: Id<"messages"> | string) => {
      void requestDeleteMessage(id);
    },
    [requestDeleteMessage],
  );
  const handleSelectChat = useCallback(
    (id: Id<"chats"> | string | null) => {
      userSelectedChatAtRef.current = Date.now();
      if (!id) {
        navigateHome();
        return;
      }
      navHandleSelectChat(String(id));
    },
    [navigateHome, navHandleSelectChat],
  );
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
    enabled: usePagination,
  });
  const handlePaginatedLoadMore = useCallback(async () => {
    await loadMore();
  }, [loadMore]);
  const pagination = useMemo(
    () => ({
      isLoadingMore,
      hasMore,
      onLoadMore: handlePaginatedLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      onClearError: clearError,
    }),
    [
      isLoadingMore,
      hasMore,
      handlePaginatedLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      clearError,
    ],
  );
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
  const isSharedRoute = !!(propShareId || propPublicId);
  const canCheckWrite =
    isSharedRoute && !!currentChatId && IdUtils.isConvexId(currentChatId);
  const canWriteChat = useQuery(
    api.chats.canWriteChat,
    canCheckWrite
      ? {
          chatId: IdUtils.toConvexChatId(currentChatId),
          sessionId: sessionId || undefined,
        }
      : "skip",
  );
  const isReadOnly =
    isSharedRoute && !!currentChatId && canWriteChat === "denied";
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
        const chat = await chatActions.createChat("New Chat");
        if (chat?._id) {
          // Direct navigation — we know the chat exists because we just created it.
          // Do NOT use navigateWithVerification here: allChats reactive query
          // may not have updated yet, causing silent navigation failure.
          navigateToChat(String(chat._id));
          setIsCreatingChat(false);
          return chat._id;
        }
      } catch (error) {
        logger.error("Failed to create chat:", error);
        chatActions.setError("Failed to create a new chat. Please try again.");
      }
      setIsCreatingChat(false);
      return null;
    },
    [chatActions, navigateToChat],
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
  const { handleSendMessage, sendRef } = useMessageHandler({
    // State
    isGenerating,
    currentChatId,
    messageCount,
    chatState,

    // Actions
    setIsGenerating: setLocalIsGenerating,
    setMessageCount,

    // Functions
    handleNewChat,
    maybeShowFollowUpPrompt,
    chatActions,
    navigateToChat,
    setErrorMessage: chatActions.setError,
  });
  useEffect(() => {
    sendRefTemp.current = sendRef.current;
  }, [sendRef]);
  const { handleDraftChange: analyzeDraft } = useDraftAnalyzer();
  const handleDraftChange = useCallback(
    (draft: string) => {
      if (!isGenerating) analyzeDraft(draft);
    },
    [isGenerating, analyzeDraft],
  );
  useAutoCreateFirstChat();
  const isMobile = useIsMobile(1024);
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
    handleRequestDeleteChat: handleDeleteChat,
    handleRequestDeleteMessage: handleDeleteMessage,
    handleMobileSidebarClose,
    handleSendMessage,
    handleDraftChange,
    setShowShareModal,
    isReadOnly,
    userHistory,
    pagination,
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
    />
  );
}

export const ChatInterface = React.memo(ChatInterfaceComponent);
export default ChatInterface;
