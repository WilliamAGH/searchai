/**
 * Chat layout component
 * Handles the layout structure and conditional rendering
 */

import React from "react";
import { ChatSidebar } from "../ChatSidebar";
import { MobileSidebar } from "../MobileSidebar";
import { MessageList } from "../MessageList";
import { MessageInput } from "../MessageInput";
import { ChatToolbar } from "../ChatToolbar";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { UndoBanner } from "../UndoBanner";
import { ShareModalContainer } from "../ShareModalContainer";
import type { Chat } from "../../lib/types/chat";
import type { ChatState, ChatActions } from "../../hooks/types";

type ChatSidebarProps = React.ComponentProps<typeof ChatSidebar>;
type MobileSidebarProps = React.ComponentProps<typeof MobileSidebar>;
type MessageListProps = React.ComponentProps<typeof MessageList>;
type MessageInputProps = React.ComponentProps<typeof MessageInput>;

interface ChatLayoutProps {
  // Layout state
  sidebarOpen: boolean;
  isMobile: boolean;
  showShareModal: boolean;
  showFollowUpPrompt: boolean;
  currentChatId: string | null;
  currentChat: Chat | null;
  isAuthenticated: boolean;
  allChats: Chat[];

  // UI state
  undoBanner: {
    message: string;
    action?: () => void;
  } | null;
  plannerHint?: {
    reason?: string;
    confidence?: number;
  };

  // Component props
  chatSidebarProps: ChatSidebarProps;
  mobileSidebarProps: MobileSidebarProps;
  messageListProps: MessageListProps;
  messageInputProps: MessageInputProps;
  swipeHandlers: Record<string, unknown>;

  // Callbacks
  setShowShareModal: (show: boolean) => void;
  setUndoBanner: (
    banner: { message: string; action?: () => void } | null,
  ) => void;
  openShareModal: () => void;
  handleContinueChat: () => void;
  handleNewChatForFollowUp: () => void;
  handleNewChatWithSummary: () => void;

  // Chat data
  chatState: ChatState;
  chatActions: ChatActions;

  // API functions
  updateChatPrivacy: (args: {
    chatId: string;
    privacy: "private" | "shared" | "public";
  }) => Promise<void>;
  navigateWithVerification: (path: string) => Promise<void>;
  buildChatPath: (chatId: string) => string;
  fetchJsonWithRetry: <T>(url: string, init?: RequestInit) => Promise<T>;
  resolveApi: (path: string) => string;
}

export function ChatLayout({
  sidebarOpen,
  isMobile,
  showShareModal,
  showFollowUpPrompt,
  currentChatId,
  currentChat,
  isAuthenticated: _isAuthenticated,
  allChats: _allChats,
  undoBanner,
  plannerHint,
  chatSidebarProps,
  mobileSidebarProps,
  messageListProps,
  messageInputProps,
  swipeHandlers,
  setShowShareModal,
  setUndoBanner,
  openShareModal: _openShareModal,
  handleContinueChat,
  handleNewChatForFollowUp,
  handleNewChatWithSummary,
  chatState: _chatState,
  chatActions,
  updateChatPrivacy: _updateChatPrivacy,
  navigateWithVerification: _navigateWithVerification,
  buildChatPath: _buildChatPath,
  fetchJsonWithRetry: _fetchJsonWithRetry,
  resolveApi,
}: ChatLayoutProps) {
  return (
    <div className="flex-1 flex h-full overflow-hidden">
      {/* Desktop Sidebar */}
      {sidebarOpen && (
        <div className="hidden lg:block w-80 flex-shrink-0">
          <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <ChatSidebar {...chatSidebarProps} />
          </div>
        </div>
      )}

      {/* Mobile Sidebar */}
      {sidebarOpen && isMobile && <MobileSidebar {...mobileSidebarProps} />}

      {/* Main content */}
      <div
        className={`flex-1 flex flex-col h-full ${!sidebarOpen || isMobile ? "max-w-4xl mx-auto w-full" : ""}`}
        {...swipeHandlers}
      >
        <div className="flex-1 flex flex-col min-h-0">
          <MessageList 
            key={String(currentChatId)} 
            {...messageListProps}
            currentChatId={currentChatId}
            chatTitle={currentChat?.title}
            onShareChat={_openShareModal}
          />
          
          {/* Chat-wide copy and share toolbar - only show when we have a persisted chat with messages */}
          {currentChatId && 
           messageListProps.messages?.length > 0 && 
           messageListProps.messages.some(m => m.role === 'assistant') && (
            <ChatToolbar
              onShare={_openShareModal}
              messages={messageListProps.messages}
              chatTitle={currentChat?.title}
            />
          )}
        </div>
        <div
          className={`flex-shrink-0 relative ${
            showFollowUpPrompt ? "pb-16" : ""
          }`}
        >
          <FollowUpPrompt
            isOpen={showFollowUpPrompt}
            onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
            hintReason={plannerHint?.reason}
            hintConfidence={plannerHint?.confidence}
          />

          {undoBanner && (
            <UndoBanner
              type={undoBanner.message.includes("Chat") ? "chat" : "message"}
              onUndo={() => {
                undoBanner.action?.();
                setUndoBanner(null);
              }}
            />
          )}
          <MessageInput key={currentChatId || "root"} {...messageInputProps} />
        </div>
      </div>

      <ShareModalContainer
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        currentChatId={currentChatId}
        currentChat={currentChat}
        chatActions={chatActions}
        resolveApi={resolveApi}
      />
    </div>
  );
}
