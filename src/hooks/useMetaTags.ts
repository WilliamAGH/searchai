import { useEffect } from "react";
import type { Chat } from "@/lib/types/chat";

interface MetaTagsProps {
  currentChatId: string | null;
  allChats: Chat[];
}

/**
 * Hook to manage document title for chat routes
 */
export function useMetaTags({ currentChatId, allChats }: MetaTagsProps) {
  useEffect(() => {
    const originalTitle = document.title;
    const resolvedChat = currentChatId
      ? allChats.find((chat) => String(chat._id ?? "") === String(currentChatId))
      : undefined;

    if (resolvedChat?.title) {
      document.title = `${resolvedChat.title} · SearchAI`;
    } else {
      document.title = "SearchAI";
    }

    return () => {
      document.title = originalTitle;
    };
  }, [currentChatId, allChats]);
}
