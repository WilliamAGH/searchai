import { useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "../lib/types/chat";
import type { Message } from "../lib/types/message";

interface UseComponentPropsArgs {
  allChats: Chat[];
  currentChatId: string | null;
  currentChat: Chat | null;
  currentMessages: Message[];
  sidebarOpen: boolean;
  isMobile: boolean;
  isGenerating: boolean;
  searchProgress: {
    stage: string;
    message: string;
    progress: number;
  } | null;
  isCreatingChat: boolean;
  showShareModal: boolean;
  isAuthenticated: boolean;
  handleSelectChat: (chatId: string | Id<"chats">) => void;
  handleToggleSidebar: () => void;
  handleNewChatButton: () => Promise<void>;
  startNewChatSession: () => Promise<void>;
  handleDeleteLocalChat: (chatId: string) => void;
  handleRequestDeleteChat: (chatId: Id<"chats">) => void;
  handleDeleteLocalMessage: (messageId: string) => void;
  handleRequestDeleteMessage: (messageId: Id<"messages">) => void;
  handleMobileSidebarClose: () => void;
  handleSendMessage: (message: string) => Promise<void>;
  handleDraftChange: (draft: string) => void;
  setShowShareModal: (show: boolean) => void;
  userHistory: string[];
  // Pagination props
  isLoadingMore?: boolean;
  hasMore?: boolean;
  onLoadMore?: () => Promise<void>;
  isLoadingMessages?: boolean;
  loadError?: Error | null;
  retryCount?: number;
  onClearError?: () => void;
  // NEW: Add streaming state
  streamingState?: {
    isStreaming: boolean;
    streamingContent: string;
    streamingMessageId?: any; // Convex ID type - will be Id<"messages">
    thinking?: string;
  };
}

/**
 * Hook to prepare component props for all child components
 */
export function useComponentProps(args: UseComponentPropsArgs) {
  const {
    allChats,
    currentChatId,
    currentChat,
    currentMessages,
    sidebarOpen,
    isMobile,
    isGenerating,
    searchProgress,
    isCreatingChat,
    isAuthenticated,
    handleSelectChat,
    handleNewChatButton,
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
    onLoadMore,
    isLoadingMessages,
    loadError,
    retryCount,
    onClearError,
    // NEW: Add streaming state for real-time updates
    streamingState,
  } = args;

  const chatSidebarProps = useMemo(
    () => ({
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      onDeleteChat: currentChat?.isLocal
        ? handleDeleteLocalChat
        : handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
      isCreatingChat,
    }),
    [
      allChats,
      currentChatId,
      currentChat?.isLocal,
      isCreatingChat,
      handleSelectChat,
      handleDeleteLocalChat,
      handleRequestDeleteChat,
      handleNewChatButton,
    ],
  );

  const mobileSidebarProps = useMemo(
    () => ({
      isOpen: sidebarOpen && isMobile,
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      onDeleteChat: currentChat?.isLocal
        ? handleDeleteLocalChat
        : handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
      onClose: handleMobileSidebarClose,
      isCreatingChat,
    }),
    [
      sidebarOpen,
      isMobile,
      allChats,
      currentChatId,
      currentChat?.isLocal,
      isCreatingChat,
      handleSelectChat,
      handleDeleteLocalChat,
      handleRequestDeleteChat,
      handleNewChatButton,
      handleMobileSidebarClose,
    ],
  );

  const messageListProps = useMemo(
    () => ({
      messages: currentMessages,
      isGenerating,
      searchProgress,
      chatId: currentChatId,
      onDeleteMessage: isAuthenticated
        ? handleRequestDeleteMessage
        : handleDeleteLocalMessage,
      // Pagination props (optional, passed through)
      isLoadingMore,
      hasMore,
      onLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      onClearError,
      // NEW: Add streaming state for real-time updates
      streamingState,
    }),
    [
      currentMessages,
      isGenerating,
      searchProgress,
      currentChatId,
      isAuthenticated,
      handleRequestDeleteMessage,
      handleDeleteLocalMessage,
      isLoadingMore,
      hasMore,
      onLoadMore,
      isLoadingMessages,
      loadError,
      retryCount,
      onClearError,
      // NEW: Include streaming state in dependencies
      streamingState,
    ],
  );

  const messageInputProps = useMemo(
    () => ({
      disabled: isGenerating,
      placeholder: isGenerating
        ? "Generating response..."
        : !currentChatId
          ? "Start a new chat..."
          : "Type your message...",
      onSendMessage: handleSendMessage,
      onDraftChange: handleDraftChange,
      history: userHistory,
      onShare: isMobile ? () => setShowShareModal(true) : undefined,
    }),
    [
      isGenerating,
      currentChatId,
      handleSendMessage,
      handleDraftChange,
      userHistory,
      isMobile,
      setShowShareModal,
    ],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
  };
}
