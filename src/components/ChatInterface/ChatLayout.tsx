/**
 * Chat layout component
 * Handles the layout structure and conditional rendering
 */

import React, { useRef } from "react";
import { ChatSidebar } from "@/components/ChatSidebar";
import { MobileSidebar } from "@/components/MobileSidebar";
import { MessageList } from "@/components/MessageList";
import { MessageInput } from "@/components/MessageInput";
import { FollowUpPrompt } from "@/components/FollowUpPrompt";
import { UndoBanner } from "@/components/UndoBanner";
import { ShareModalContainer } from "@/components/ShareModalContainer";
// Global agent status overlay removed; inline statuses handle all feedback
import type { Chat } from "@/lib/types/chat";
import type { ChatActions } from "@/hooks/types";

type ChatSidebarProps = React.ComponentProps<typeof ChatSidebar>;
type MobileSidebarProps = React.ComponentProps<typeof MobileSidebar>;
type MessageListProps = React.ComponentProps<typeof MessageList>;
type MessageInputProps = React.ComponentProps<typeof MessageInput>;
type SwipeHandlers = Pick<
  React.HTMLAttributes<HTMLDivElement>,
  "onTouchStart" | "onTouchEnd"
>;

interface ChatLayoutProps {
  // Layout state
  sidebarOpen: boolean;
  isMobile: boolean;
  showShareModal: boolean;
  showFollowUpPrompt: boolean;
  currentChatId: string | null;
  currentChat: Chat | null;

  // UI state
  undoBanner: {
    message: string;
    action?: () => void;
  } | null;
  plannerHint?: {
    reason?: string;
    confidence?: number;
  } | null;

  // Component props
  chatSidebarProps: ChatSidebarProps;
  mobileSidebarProps: MobileSidebarProps;
  messageListProps: MessageListProps;
  messageInputProps: MessageInputProps;
  swipeHandlers: SwipeHandlers;

  // Callbacks
  setShowShareModal: (show: boolean) => void;
  setUndoBanner: (
    banner: { message: string; action?: () => void } | null,
  ) => void;
  handleContinueChat: () => void;
  handleNewChatForFollowUp: () => void;
  handleNewChatWithSummary: () => void;

  // Chat data
  chatActions: ChatActions;
}

export function ChatLayout({
  sidebarOpen,
  isMobile,
  showShareModal,
  showFollowUpPrompt,
  currentChatId,
  currentChat,
  undoBanner,
  plannerHint,
  chatSidebarProps,
  mobileSidebarProps,
  messageListProps,
  messageInputProps,
  swipeHandlers,
  setShowShareModal,
  setUndoBanner,
  handleContinueChat,
  handleNewChatForFollowUp,
  handleNewChatWithSummary,
  chatActions,
}: Readonly<ChatLayoutProps>) {
  // Desktop sidebar visible: not mobile AND sidebar is open
  const showDesktopSidebar = !isMobile && sidebarOpen;

  // Ref for the scroll container - passed to MessageList for scroll handling
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="flex-1 flex h-full min-h-0 min-w-0 relative overflow-x-hidden">
      {/* Desktop Sidebar - Fixed position so scroll appears at browser edge */}
      {showDesktopSidebar && (
        <div className="desktop-sidebar-container fixed left-0 top-[3.75rem] sm:top-16 w-80 h-[calc(var(--app-dvh,100dvh)_-_3.75rem)] sm:h-[calc(var(--app-dvh,100dvh)_-_4rem)] z-40">
          <div className="h-full border-r border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900">
            <ChatSidebar {...chatSidebarProps} />
          </div>
        </div>
      )}

      {/* Mobile Sidebar */}
      {sidebarOpen && isMobile && <MobileSidebar {...mobileSidebarProps} />}

      {/* Main content - full width scroll container, scrollbar at browser edge */}
      {/*
        DO NOT REMOVE OR OVERRIDE: Layout Stability Strategy
        - pl-80: Uses padding instead of margin (ml-80) to keep the scrollbar at the browser edge
          while reserving space for the fixed sidebar. Margin pushes the scrollbar off-screen.
        - w-full + box-border: Prevents right-edge overflow when sidebar padding is applied.
        - min-w-0: Critical for allowing flex children to shrink below their content size.
      */}
      <div
        ref={scrollContainerRef}
        className={`w-full box-border flex flex-col h-full min-h-0 min-w-0 overflow-y-auto overflow-x-hidden overscroll-contain ${showDesktopSidebar ? "pl-80" : ""}`}
        {...swipeHandlers}
      >
        {/*
          DO NOT REMOVE OR OVERRIDE: Content Containment
          - max-w-4xl mx-auto: Enforces consistent reading width regardless of sidebar state.
            Removing this causes jarring layout shifts and "blown out" content when sidebar opens.
          - w-full: Ensures alignment within the flex container.
          - min-w-0: Prevents flex items from overflowing their container.
        */}
        {/*
          pb-20: Reserves space so the last message content is never hidden
          behind the sticky input bar. The input area is ~70px tall; 80px
          (pb-20) gives comfortable clearance including safe-area insets.
        */}
        <div className="grow shrink-0 flex flex-col min-w-0 max-w-4xl mx-auto w-full pb-20">
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
        <div className="flex-shrink-0 sticky bottom-0 bg-gradient-to-br bg-fixed from-gray-50 via-white to-gray-100 dark:from-gray-950 dark:via-gray-900 dark:to-gray-800 pb-[env(safe-area-inset-bottom)] w-full">
          <div className="relative max-w-4xl mx-auto w-full">
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
            <MessageInput
              key={currentChatId || "root"}
              {...messageInputProps}
            />
          </div>
        </div>
      </div>

      <ShareModalContainer
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        currentChatId={currentChatId}
        currentChat={currentChat}
        chatActions={chatActions}
      />

      {/* Global agent status overlay removed to prevent overlap and duplication */}
    </div>
  );
}
