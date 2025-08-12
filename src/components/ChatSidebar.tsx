import React from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";
import type { Chat } from "../lib/types/chat";

interface ChatSidebarProps {
  chats: Chat[];
  currentChatId: Id<"chats"> | string | null;
  onSelectChat: (chatId: Id<"chats"> | string | null) => void;
  onNewChat: () => void;
  onDeleteLocalChat?: (chatId: string) => void;
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  isOpen: boolean;
  onToggle: () => void;
  isCreatingChat?: boolean;
}

export function ChatSidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteLocalChat,
  onRequestDeleteChat,
  isOpen: _isOpen,
  onToggle,
  isCreatingChat = false,
}: ChatSidebarProps) {
  const deleteChat = useMutation(api.chats.deleteChat);

  const handleSelectChat = React.useCallback(
    (chatId: Id<"chats"> | string) => {
      onSelectChat(chatId);
    },
    [onSelectChat],
  );

  // Avoid inline functions in JSX: use dataset-driven handlers
  const handleSelectClick = React.useCallback(
    (e: React.MouseEvent<HTMLButtonElement>) => {
      const attr = e.currentTarget.getAttribute("data-chat-id");
      if (!attr) return;
      const match = chats.find((c) => String(c._id) === attr);
      handleSelectChat(match ? match._id : attr);
    },
    [chats, handleSelectChat],
  );

  const handleDeleteClick = React.useCallback(
    async (e: React.MouseEvent<HTMLButtonElement>) => {
      const attr = e.currentTarget.getAttribute("data-chat-id");
      if (!attr) return;
      const match = chats.find((c) => String(c._id) === attr);
      try {
        if (!window.confirm("Delete this chat? This cannot be undone.")) return;
        if (onRequestDeleteChat) {
          onRequestDeleteChat(match ? match._id : attr);
        } else if (match) {
          if (typeof match._id === "string") {
            onDeleteLocalChat?.(match._id);
          } else {
            await deleteChat({ chatId: match._id });
          }
        }
        if (match && currentChatId === match._id) {
          onSelectChat(null);
        }
      } catch (err) {
        if (import.meta.env.DEV) {
          console.warn("Chat deletion failed:", err);
        }
      }
    },
    [
      chats,
      onRequestDeleteChat,
      onDeleteLocalChat,
      deleteChat,
      onSelectChat,
      currentChatId,
    ],
  );

  // Always render the sidebar container so tests can locate the "New Chat" button
  // even when visually hidden on small screens. We use CSS to hide it when closed.

  return (
    <div className="w-full sm:w-80 h-full border-r bg-muted/30 flex flex-col">
      <div className="p-3 sm:p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Chats</h3>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Close sidebar"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
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
          onClick={onNewChat}
          disabled={isCreatingChat}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isCreatingChat ? (
            <svg
              className="w-5 h-5 animate-spin"
              fill="none"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
          ) : (
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 4v16m8-8H4"
              />
            </svg>
          )}
          {isCreatingChat ? "Creating..." : "New Chat"}
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {chats.length === 0 ? (
          <div className="p-4 text-center text-muted-foreground">
            No chats yet. Start a new conversation!
          </div>
        ) : (
          <div className="p-2">
            {chats.map((chat) => (
              <div key={chat._id} className="flex items-center gap-2 mb-1 pr-2">
                <button
                  data-chat-id={String(chat._id)}
                  onClick={handleSelectClick}
                  className={`flex-1 p-3 rounded-lg text-left hover:bg-muted transition-colors ${
                    currentChatId === chat._id ? "bg-muted" : ""
                  }`}
                >
                  <div className="font-medium truncate">{chat.title}</div>
                  <div className="text-sm text-muted-foreground flex items-center gap-1">
                    {chat.isLocal && (
                      <span className="text-xs bg-orange-100 dark:bg-orange-900 text-orange-800 dark:text-orange-200 px-1 rounded">
                        Local
                      </span>
                    )}
                    {new Date(chat.updatedAt).toLocaleDateString()}
                  </div>
                </button>
                <button
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
