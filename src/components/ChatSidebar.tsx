import { useMutation } from "convex/react";
import React from "react";
import { api } from "../../convex/_generated/api";
import { Spinner } from "./ui/Spinner";
/* --------------------------------------------------------------
   IMPORTANT: Convex‑generated types are the *single source of truth*.
   We import the document type directly from the generated data model
   instead of a hand‑rolled duplicate. This eliminates the TS2589/
   “excessively deep” error and guarantees that the ID we pass to
   Convex is a proper `Id<"chats">`.
   -------------------------------------------------------------- */
import type { Id } from "../../convex/_generated/dataModel";

// Use the app-wide Chat union to support both local and server chats.
import type { Chat } from "../lib/types/chat";
import { logger } from "../lib/logger";
import { isConvexChatId } from "../lib/utils/id";

/**
 * Props for the ChatSidebar component
 * @interface ChatSidebarProps
 */
interface ChatSidebarProps {
  /** List of all available chats to display */
  chats: Chat[];
  /** ID of the currently selected/active chat */
  currentChatId: Id<"chats"> | string | null;
  /** Callback fired when user selects a chat from the list */
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  /** Callback fired when user clicks the "New Chat" button */
  onNewChat: () => void;
  /** Optional callback to delete a local (non-synced) chat */
  onDeleteLocalChat?: (chatId: string) => void;
  /** Optional callback to request deletion of a synced chat */
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  /** Controls whether the sidebar is visible (mobile) or expanded (desktop) */
  isOpen: boolean;
  /** Callback to toggle sidebar open/closed state */
  onToggle: () => void;
  /** Indicates if a new chat is currently being created (shows loading state) */
  isCreatingChat?: boolean;
}

/**
 * ChatSidebar component - Main navigation sidebar for chat selection and management
 *
 * Provides:
 * - List of all available chats with titles
 * - Chat selection functionality
 * - New chat creation button
 * - Chat deletion capabilities
 * - Responsive behavior (drawer on mobile, sidebar on desktop)
 *
 * @component
 * @param {ChatSidebarProps} props - Component props
 * @returns {JSX.Element} Rendered sidebar component
 */
export function ChatSidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteLocalChat,
  onRequestDeleteChat: _onRequestDeleteChat,
  isOpen: _isOpen,
  onToggle,
  isCreatingChat = false,
}: ChatSidebarProps) {
  logger.debug("[SIDEBAR] Rendering with:", {
    chatCount: chats.length,
    currentChatId,
    chats: chats.map((c) => ({ id: c.id, _id: c._id, title: c.title })),
  });
  const deleteChat = useMutation(api.chats.deleteChat);

  const handleSelectChat = React.useCallback(
    (chatId: Id<"chats"> | string) => {
      logger.debug("[SIDEBAR] handleSelectChat called with:", chatId);
      onSelectChat(chatId);
    },
    [onSelectChat],
  );

  // Avoid inline functions in JSX: use dataset-driven handlers
  const handleSelectClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const attr = e.currentTarget.getAttribute("data-chat-id");
      logger.debug("[SIDEBAR] handleSelectClick - data-chat-id:", attr);
      if (!attr) {
        console.error("[SIDEBAR] No data-chat-id attribute found!");
        return;
      }
      // Find the chat object whose typed Id matches the attribute
      const match = chats.find((c) => String(c._id) === attr);
      logger.debug("[SIDEBAR] Found matching chat:", match);
      // Ensure we pass a correctly-typed value (Id or string) to the parent callback
      const selectedId: Id<"chats"> | string = match
        ? match._id
        : isConvexChatId(attr)
          ? (attr as Id<"chats">)
          : attr;
      logger.debug("[SIDEBAR] Selecting chat with ID:", selectedId);
      handleSelectChat(selectedId);
    },
    [chats, handleSelectChat],
  );

  const handleDeleteClick = React.useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const attr = e.currentTarget.getAttribute("data-chat-id");
      if (!attr) {
        logger.warn(
          "[SIDEBAR] handleDeleteClick: No data-chat-id attribute found",
        );
        return;
      }

      const chatToDelete = chats.find((c) => String(c._id) === attr);

      logger.info("[SIDEBAR] Delete requested for chat:", {
        idFromAttr: attr,
        matchedChat: chatToDelete ? { ...chatToDelete } : "not_found",
      });

      if (!chatToDelete) {
        logger.error("[SIDEBAR] No matching chat found for ID:", attr);
        return;
      }

      try {
        if (!window.confirm("Delete this chat? This cannot be undone.")) {
          logger.info("[SIDEBAR] Delete cancelled by user");
          return;
        }

        logger.info("[SIDEBAR] Deleting chat:", { chatId: chatToDelete._id });

        // Use the proper deletion handler that includes error handling and UI updates
        if (_onRequestDeleteChat) {
          // This handler properly manages both Convex and local deletions
          await _onRequestDeleteChat(chatToDelete._id);
          logger.info("[SIDEBAR] Delete request handled");
        } else if (isConvexChatId(chatToDelete._id)) {
          // Fallback to direct Convex deletion
          await deleteChat({ chatId: chatToDelete._id });
          logger.info("[SIDEBAR] Convex chat deleted successfully");
        } else {
          // Fallback to local deletion
          onDeleteLocalChat?.(chatToDelete._id);
          logger.info("[SIDEBAR] Local chat deleted successfully");
        }

        if (currentChatId === chatToDelete._id) {
          onSelectChat(null);
          logger.info("[SIDEBAR] Resetting current chat");
        }
      } catch (err) {
        logger.error("[SIDEBAR] Chat deletion failed:", err);
      }
    },
    [
      chats,
      deleteChat,
      onDeleteLocalChat,
      onSelectChat,
      currentChatId,
      _onRequestDeleteChat,
    ],
  );

  // Always render the sidebar container so tests can locate the "New Chat" button
  // even when visually hidden on small screens. We use CSS to hide it when closed.

  return (
    <div className="w-full h-full bg-muted/30 flex flex-col">
      <div className="p-3 sm:p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Chats</h3>
          <button
            type="button"
            onClick={() => {
              onToggle();
            }}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Close sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>Close sidebar</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={onNewChat}
          disabled={isCreatingChat}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreatingChat ? (
            <Spinner size="sm" className="w-5 h-5" aria-label="Creating chat" />
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <title>New chat</title>
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          {isCreatingChat ? "Creating" : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No chats yet. Start a new conversation!
          </div>
        ) : (
          <div className="p-2">
            {chats.map((chat, index) => (
              <div
                key={chat._id || chat.id || `chat-${index}`}
                className="flex items-center gap-2 mb-1 pr-2 min-w-0"
              >
                <button
                  type="button"
                  data-chat-id={String(chat._id)}
                  onClick={handleSelectClick}
                  className={`flex-1 min-w-0 p-3 rounded-lg text-left hover:bg-muted transition-colors ${
                    currentChatId === chat._id ? "bg-muted" : ""
                  }`}
                >
                  <div className="font-medium truncate min-w-0">
                    {chat.title}
                  </div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1 min-w-0">
                    <span className="truncate">
                      {new Date(chat.updatedAt).toLocaleDateString()}
                    </span>
                  </div>
                </button>
                <button
                  type="button"
                  data-chat-id={String(chat._id)}
                  onClick={handleDeleteClick}
                  className="flex-shrink-0 p-2 text-gray-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-200"
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    viewBox="0 0 24 24"
                    xmlns="http://www.w3.org/2000/svg"
                  >
                    <title>Delete chat</title>
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                    />
                  </svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
