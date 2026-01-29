import { useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "@/lib/types/chat";
import type { Message, SearchProgress, PaginationState } from "@/lib/types/message";

interface UseComponentPropsArgs {
  allChats: Chat[];
  currentChatId: string | null;
  currentMessages: Message[];
  sidebarOpen: boolean;
  isMobile: boolean;
  isGenerating: boolean;
  searchProgress: SearchProgress | null;
  isCreatingChat: boolean;
  handleSelectChat: (chatId: string | Id<"chats"> | null) => void;
  handleToggleSidebar: () => void;
  handleNewChatButton: () => Promise<void>;
  handleRequestDeleteChat: (chatId: Id<"chats"> | string) => void;
  handleRequestDeleteMessage: (messageId: Id<"messages"> | string) => void;
  handleMobileSidebarClose: () => void;
  handleSendMessage: (message: string) => Promise<void>;
  handleDraftChange: (draft: string) => void;
  setShowShareModal: (show: boolean) => void;
  userHistory: string[];
  pagination?: Partial<PaginationState>;
}

/**
 * Hook to prepare component props for all child components
 */
export function useComponentProps({
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
  pagination,
}: UseComponentPropsArgs) {
  const chatSidebarProps = useMemo(
    () => ({
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      onRequestDeleteChat: handleRequestDeleteChat,
      onNewChat: handleNewChatButton,
      isOpen: sidebarOpen,
      onToggle: handleToggleSidebar,
      isCreatingChat,
    }),
    [
      allChats,
      sidebarOpen,
      currentChatId,
      isCreatingChat,
      handleSelectChat,
      handleRequestDeleteChat,
      handleToggleSidebar,
      handleNewChatButton,
    ],
  );

  const mobileSidebarProps = useMemo(
    () => ({
      isOpen: sidebarOpen && isMobile,
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
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
      onToggleSidebar: handleToggleSidebar,
      onRequestDeleteMessage: (messageId: string) => handleRequestDeleteMessage(messageId),
      // Pagination props (spread from grouped state)
      isLoadingMore: pagination?.isLoadingMore,
      hasMore: pagination?.hasMore,
      onLoadMore: pagination?.onLoadMore,
      isLoadingMessages: pagination?.isLoadingMessages,
      loadError: pagination?.loadError,
      retryCount: pagination?.retryCount,
      onClearError: pagination?.onClearError,
    }),
    [
      currentMessages,
      isGenerating,
      searchProgress,
      handleRequestDeleteMessage,
      handleToggleSidebar,
      pagination,
    ],
  );

  const messageInputProps = useMemo(
    () => ({
      disabled: false, // Never block input - allow sending messages while generating
      placeholder: !currentChatId ? "Start a new chat..." : "Type your message...",
      onSendMessage: handleSendMessage,
      onDraftChange: handleDraftChange,
      history: userHistory,
      onShare: isMobile ? () => setShowShareModal(true) : undefined,
    }),
    [currentChatId, handleSendMessage, handleDraftChange, userHistory, isMobile, setShowShareModal],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
  };
}
