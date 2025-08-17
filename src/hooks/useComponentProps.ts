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
  isReadOnly?: boolean; // Whether the current chat is read-only (public/shared non-owned)
  handleSelectChat: (chatId: string | Id<"chats">) => void;
  handleToggleSidebar: () => void;
  handleNewChatButton: () => Promise<void>;
  startNewChatSession: () => Promise<void>;
  handleDeleteLocalChat: (chatId: string) => void;
  handleRequestDeleteChat: (chatId: Id<"chats"> | string) => void;
  handleDeleteLocalMessage: (messageId: string) => void;
  handleRequestDeleteMessage: (messageId: Id<"messages"> | string) => void;
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
    streamingMessageId?: Id<"messages"> | string;
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
    _isReadOnly = false, // Default to false if not provided
    handleSelectChat,
    handleToggleSidebar,
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
      onDeleteLocalChat: handleDeleteLocalChat,
      onRequestDeleteChat: handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
      isOpen: sidebarOpen,
      onToggle: handleToggleSidebar,
      isCreatingChat,
    }),
    [
      allChats,
      currentChatId,
      isCreatingChat,
      handleSelectChat,
      handleDeleteLocalChat,
      handleRequestDeleteChat,
      handleNewChatButton,
      sidebarOpen,
      handleToggleSidebar,
    ],
  );

  const mobileSidebarProps = useMemo(
    () => ({
      isOpen: sidebarOpen && isMobile,
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      onDeleteLocalChat: handleDeleteLocalChat,
      onRequestDeleteChat: handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
      onClose: handleMobileSidebarClose,
      isCreatingChat,
    }),
    [
      sidebarOpen,
      isMobile,
      allChats,
      currentChatId,
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
      currentChat,
      onToggleSidebar: handleToggleSidebar,
      onShare: () => setShowShareModal(true),
      onDeleteLocalMessage: handleDeleteLocalMessage,
      onRequestDeleteMessage: isAuthenticated
        ? handleRequestDeleteMessage
        : undefined,
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
      currentChat,
      isAuthenticated,
      handleToggleSidebar,
      setShowShareModal,
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
      disabled: isGenerating || _isReadOnly, // Disable input while generating or in read-only mode
      isGenerating, // Pass generation state separately for submit button
      placeholder: _isReadOnly
        ? "This chat is read-only" // Show read-only state
        : isGenerating
          ? "AI is generating" // Show generation state
          : !currentChatId
            ? "Start a new chat"
            : "Type your message",
      onSendMessage: handleSendMessage,
      onDraftChange: handleDraftChange,
      history: userHistory,
    }),
    [
      isGenerating,
      _isReadOnly,
      currentChatId,
      handleSendMessage,
      handleDraftChange,
      userHistory,
    ],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
  };
}
