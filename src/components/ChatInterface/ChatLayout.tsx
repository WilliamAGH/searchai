/**
 * Chat layout component
 * Handles the layout structure and conditional rendering
 */

import React, { useRef } from "react";
import { ChatSidebar } from "../ChatSidebar";
import { MobileSidebar } from "../MobileSidebar";
import { MessageList } from "../MessageList";
import { MessageInput } from "../MessageInput";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { UndoBanner } from "../UndoBanner";
import { ShareModalContainer } from "../ShareModalContainer";
// Global agent status overlay removed; inline statuses handle all feedback
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
  // Desktop sidebar visible: not mobile AND sidebar is open
  const showDesktopSidebar = !isMobile && sidebarOpen;

  // Ref for the scroll container - passed to MessageList for scroll handling
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  return (
    <div className="flex-1 flex h-full min-h-0 relative">
      {/* Desktop Sidebar - Fixed position so scroll appears at browser edge */}
      {showDesktopSidebar && (
        <div className="fixed left-0 top-[3.75rem] sm:top-16 w-80 h-[calc(100dvh-3.75rem)] sm:h-[calc(100dvh-4rem)] z-40">
          <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <ChatSidebar {...chatSidebarProps} />
          </div>
        </div>
      )}

      {/* Mobile Sidebar */}
      {sidebarOpen && isMobile && <MobileSidebar {...mobileSidebarProps} />}

      {/* Main content - full width scroll container, scrollbar at browser edge */}
      <div
        ref={scrollContainerRef}
        className={`flex-1 flex flex-col h-full min-h-0 overflow-y-auto overscroll-contain ${showDesktopSidebar ? "ml-80" : ""}`}
        {...swipeHandlers}
      >
        {/* Content wrapper: grow to fill when content is small, don't shrink when content is large */}
        {/* grow = flex-grow:1, shrink-0 = flex-shrink:0, combined with default flex-basis:auto */}
        <div
          className={`grow shrink-0 flex flex-col w-full ${!showDesktopSidebar ? "max-w-4xl mx-auto" : ""}`}
        >
          <MessageList
            key={String(currentChatId)}
            {...messageListProps}
            scrollContainerRef={scrollContainerRef}
          />
        </div>
        {/*
          Input area - sticky at bottom, relative for absolute-positioned children.

          SAFE AREA STRATEGY: This component owns bottom safe-area padding.
          Body-level padding-bottom is intentionally omitted (see index.css).
          This prevents the "floating gap" bug where double padding creates
          visible whitespace between app content and browser chrome on iOS.
        */}
        <div
          className={`flex-shrink-0 sticky bottom-0 relative bg-gradient-to-br from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 pb-[env(safe-area-inset-bottom)] ${!showDesktopSidebar ? "max-w-4xl mx-auto w-full" : ""}`}
        >
          <FollowUpPrompt
            isOpen={showFollowUpPrompt}
            onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
            hintReason={plannerHint?.reason}
            hintConfidence={plannerHint?.confidence}
          />

          {/* Remove share button - now using icon in MessageInput */}
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

      {/* Global agent status overlay removed to prevent overlap and duplication */}
    </div>
  );
}
