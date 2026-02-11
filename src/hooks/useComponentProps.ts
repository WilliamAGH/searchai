import { useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "@/lib/types/chat";
import type {
  Message,
  SearchProgress,
  PaginationState,
} from "@/lib/types/message";

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
  isReadOnly?: boolean;
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
  isReadOnly = false,
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
      onRequestDeleteMessage: (messageId: string) =>
        handleRequestDeleteMessage(messageId),
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
      disabled: isReadOnly,
      placeholder: isReadOnly
        ? "Read-only shared chat"
        : currentChatId
          ? "Type your message..."
          : "Start a new chat...",
      onSendMessage: handleSendMessage,
      onDraftChange: handleDraftChange,
      history: userHistory,
      onShare: () => setShowShareModal(true),
      onNewChat: handleNewChatButton,
    }),
    [
      currentChatId,
      isReadOnly,
      handleSendMessage,
      handleDraftChange,
      userHistory,
      setShowShareModal,
      handleNewChatButton,
    ],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
  };
}
