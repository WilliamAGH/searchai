import React from 'react';
import { Id } from '../../convex/_generated/dataModel';

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
  isOpen: boolean;
  onToggle: () => void;
}

export function ChatSidebar({ 
  chats, 
  currentChatId, 
  onSelectChat, 
  onNewChat, 
  isOpen, 
  onToggle 
}: ChatSidebarProps) {
  if (!isOpen) {
    return (
      <div className="w-12 border-r bg-muted/30 flex flex-col">
        <button
          onClick={onToggle}
          className="p-3 hover:bg-muted transition-colors"
          title="Open sidebar"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
          </svg>
        </button>
        <button
          onClick={onNewChat}
          className="p-3 hover:bg-muted transition-colors mt-2"
          title="New chat"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
          </svg>
        </button>
      </div>
    );
  }

  return (
    <div className="w-full sm:w-80 border-r bg-muted/30 flex flex-col">
      <div className="p-3 sm:p-4 border-b">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold">Chats</h3>
          <button
            onClick={onToggle}
            className="p-1 hover:bg-muted rounded transition-colors"
            title="Close sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        <button
          onClick={onNewChat}
          className="w-full px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
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
              <button
                key={chat._id}
                onClick={() => onSelectChat(chat._id as any)}
                className={`w-full p-3 rounded-lg text-left hover:bg-muted transition-colors mb-1 ${
                  currentChatId === chat._id ? 'bg-muted' : ''
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
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
