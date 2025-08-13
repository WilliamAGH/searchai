/**
 * Chat layout component
 * Handles the layout structure and conditional rendering
 */

import React from "react";
import { ChatSidebar } from "../ChatSidebar";
import { MobileSidebar } from "../MobileSidebar";
import { MessageList } from "../MessageList";
import { MessageInput } from "../MessageInput";
import { FollowUpPrompt } from "../FollowUpPrompt";
import { UndoBanner } from "../UndoBanner";
import { ShareModalContainer } from "../ShareModalContainer";
import type { Chat } from "../../lib/types/chat";
import type { ChatState, ChatActions } from "../../hooks/types";

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
  chatSidebarProps: unknown;
  mobileSidebarProps: unknown;
  messageListProps: unknown;
  messageInputProps: unknown;
  swipeHandlers: unknown;

  // Callbacks
  setShowShareModal: (show: boolean) => void;
  setUndoBanner: (banner: unknown) => void;
  openShareModal: () => void;
  handleContinueChat: () => void;
  handleNewChatForFollowUp: () => void;
  handleNewChatWithSummary: () => void;

  // Chat data
  chatState: ChatState;
  chatActions: ChatActions;

  // API functions
  updateChatPrivacy: unknown;
  navigateWithVerification: unknown;
  buildChatPath: unknown;
  fetchJsonWithRetry: unknown;
  resolveApi: unknown;
}

export function ChatLayout({
  sidebarOpen,
  isMobile,
  showShareModal,
  showFollowUpPrompt,
  currentChatId,
  currentChat,
  isAuthenticated,
  allChats,
  undoBanner,
  plannerHint,
  chatSidebarProps,
  mobileSidebarProps,
  messageListProps,
  messageInputProps,
  swipeHandlers,
  setShowShareModal,
  setUndoBanner,
  openShareModal,
  handleContinueChat,
  handleNewChatForFollowUp,
  handleNewChatWithSummary,
  chatState,
  chatActions,
  updateChatPrivacy,
  navigateWithVerification,
  buildChatPath,
  fetchJsonWithRetry,
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
          <MessageList key={String(currentChatId)} {...messageListProps} />
        </div>
        <div className="flex-shrink-0 relative">
          {showFollowUpPrompt && (
            <div aria-hidden="true" className="h-12 sm:h-12" />
          )}
          <FollowUpPrompt
            isOpen={showFollowUpPrompt}
            onContinue={handleContinueChat}
            onNewChat={handleNewChatForFollowUp}
            onNewChatWithSummary={handleNewChatWithSummary}
            hintReason={plannerHint?.reason}
            hintConfidence={plannerHint?.confidence}
          />

          {/* Inline Share button to open ShareModal (targeted by E2E tests) */}
          <div className="absolute right-3 bottom-[4.5rem] sm:bottom-[4.75rem]">
            <button
              type="button"
              onClick={openShareModal}
              className="hidden sm:inline-flex h-8 items-center justify-center px-3 text-sm font-medium bg-emerald-500 text-white hover:bg-emerald-600 rounded-md transition-colors"
              aria-label="Share this conversation"
              title="Share this conversation"
            >
              Share
            </button>
          </div>
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
        allChats={allChats}
        isAuthenticated={isAuthenticated}
        chatState={chatState}
        chatActions={chatActions}
        updateChatPrivacy={updateChatPrivacy}
        navigateWithVerification={navigateWithVerification}
        buildChatPath={buildChatPath}
        fetchJsonWithRetry={fetchJsonWithRetry}
        resolveApi={resolveApi}
      />
    </div>
  );
}
