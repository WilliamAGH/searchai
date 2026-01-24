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
  // Session ID for authorization (anonymous users)
  sessionId?: string;
}

/**
 * Hook to prepare component props for all child components
 */
export function useComponentProps({
  allChats,
  currentChatId,
  currentChat: _currentChat,
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
  sessionId,
}: UseComponentPropsArgs) {
  const chatSidebarProps = useMemo(
    () => ({
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      // Pass both handlers explicitly; component decides which to use per chat
      onDeleteLocalChat: handleDeleteLocalChat,
      onRequestDeleteChat: handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
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
    ],
  );

  const mobileSidebarProps = useMemo(
    () => ({
      isOpen: sidebarOpen && isMobile,
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      // Pass both handlers explicitly; component decides which to use per chat
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
      // Session ID for authorization (anonymous users)
      sessionId,
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
      sessionId,
    ],
  );

  const messageInputProps = useMemo(
    () => ({
      disabled: false, // Never block input - allow sending messages while generating
      placeholder: !currentChatId
        ? "Start a new chat..."
        : "Type your message...",
      onSendMessage: handleSendMessage,
      onDraftChange: handleDraftChange,
      history: userHistory,
      onShare: isMobile ? () => setShowShareModal(true) : undefined,
    }),
    [
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
