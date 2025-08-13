import { useMemo } from "react";
import type { Id } from "../../convex/_generated/dataModel";

interface UseComponentPropsArgs {
  allChats: any[];
  currentChatId: string | null;
  currentChat: any;
  currentMessages: any[];
  sidebarOpen: boolean;
  isMobile: boolean;
  isGenerating: boolean;
  searchProgress: any;
  isCreatingChat: boolean;
  showShareModal: boolean;
  setShowShareModal: (show: boolean) => void;
  handleDeleteLocalChat: (chatId: string) => void;
  handleRequestDeleteChat: (chatId: Id<"chats">) => void;
  handleSelectChat: (chatId: string) => void;
  handleRequestNewChat: () => void;
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
  setShowShareModal,
  handleDeleteLocalChat,
  handleRequestDeleteChat,
  handleSelectChat,
  handleRequestNewChat,
}: UseComponentPropsArgs) {
  const chatSidebarProps = useMemo(
    () => ({
      chats: allChats,
      currentChatId,
      onSelectChat: handleSelectChat,
      onDeleteChat: currentChat?.isLocal
        ? handleDeleteLocalChat
        : handleRequestDeleteChat,
      onNewChat: handleRequestNewChat,
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
      handleRequestNewChat,
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
      onNewChat: handleRequestNewChat,
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
      handleRequestNewChat,
    ],
  );

  const messageListProps = useMemo(
    () => ({
      messages: currentMessages,
      isGenerating,
      searchProgress,
      chatId: currentChatId,
    }),
    [currentMessages, isGenerating, searchProgress, currentChatId],
  );

  const messageInputProps = useMemo(
    () => ({
      disabled: isGenerating || !currentChatId,
      placeholder: isGenerating
        ? "Generating response..."
        : "Type your message...",
    }),
    [isGenerating, currentChatId],
  );

  const chatControlsProps = useMemo(
    () => ({
      currentChat,
      showShareModal,
      setShowShareModal,
      isGenerating,
    }),
    [currentChat, showShareModal, setShowShareModal, isGenerating],
  );

  return {
    chatSidebarProps,
    mobileSidebarProps,
    messageListProps,
    messageInputProps,
    chatControlsProps,
  };
}
