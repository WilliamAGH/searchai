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
}

/**
 * Hook to prepare component props for all child components
 */
export function useComponentProps({
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
}: UseComponentPropsArgs) {
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
    }),
    [
      currentMessages,
      isGenerating,
      searchProgress,
      currentChatId,
      isAuthenticated,
      handleRequestDeleteMessage,
      handleDeleteLocalMessage,
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
    }),
    [
      isGenerating,
      currentChatId,
      handleSendMessage,
      handleDraftChange,
      userHistory,
    ],
  );

  const chatControlsProps = useMemo(
    () => ({
      currentChat,
      showShareModal,
      setShowShareModal,
      isGenerating,
      onNewChat: startNewChatSession,
      onToggleSidebar: handleToggleSidebar,
    }),
    [
      currentChat,
      showShareModal,
      setShowShareModal,
      isGenerating,
      startNewChatSession,
      handleToggleSidebar,
    ],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
    chatControlsProps,
  };
}
