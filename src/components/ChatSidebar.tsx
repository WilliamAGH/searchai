import React from "react";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Id } from "../../convex/_generated/dataModel";

interface Chat {
  _id: Id<"chats"> | string;
  title: string;
  createdAt: number;
  updatedAt: number;
  isLocal?: boolean;
}

interface ChatSidebarProps {
  chats: Chat[];
  currentChatId: Id<"chats"> | string | null;
  onSelectChat: (chatId: Id<"chats"> | string) => void;
  onNewChat: () => void;
  onDeleteLocalChat?: (chatId: string) => void;
  onRequestDeleteChat?: (chatId: Id<"chats"> | string) => void;
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatSidebar({
  chats,
  currentChatId,
  onSelectChat,
  onNewChat,
  onDeleteLocalChat,
  onRequestDeleteChat,
  isOpen,
  onToggle,
}: ChatSidebarProps) {
  const deleteChat = useMutation(api.chats.deleteChat);
  if (!isOpen) {
    return (
      <div className="w-12 h-full border-r bg-muted/30 flex flex-col">
        <button
          onClick={onToggle}
          className="p-3 hover:bg-muted transition-colors"
          title="Open sidebar"
        >
          <svg
            className="w-6 h-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
        <button
          onClick={onNewChat}
          className="p-3 hover:bg-muted transition-colors mt-2"
          title="New chat"
        >
          <svg
            className="w-6 h-6"
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
        </button>
      </div>
    );
  }

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
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
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
              d="M12 4v16m8-8H4"
            />
          </svg>
          New Chat
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
              <div key={chat._id} className="flex items-center gap-2 mb-1">
                <button
                  onClick={() => onSelectChat(chat._id as any)}
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
                  onClick={async () => {
                    try {
                      if (
                        !window.confirm(
                          "Delete this chat? This cannot be undone.",
                        )
                      )
                        return;
                      if (onRequestDeleteChat) {
                        onRequestDeleteChat(chat._id as any);
                      } else {
                        if (typeof chat._id === "string") {
                          // Local chat deletion
                          onDeleteLocalChat?.(chat._id);
                        } else {
                          await deleteChat({ chatId: chat._id });
                        }
                      }
                      if (currentChatId === chat._id) {
                        onSelectChat(null as any);
                      }
                    } catch {
                      // intentionally ignored
                    }
                  }}
                  className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/30 rounded"
                  title="Delete chat"
                  aria-label="Delete chat"
                >
                  <svg
                    className="w-4 h-4"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6M9 7h6m-1-3H10a1 1 0 00-1 1v2h8V5a1 1 0 00-1-1z"
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
