// Minimal adapter to convert between chat formats
import type { LocalChat } from "../types/chat";

export function localChatToUnified(chat: LocalChat) {
  return {
    id: chat._id,
    title: chat.title || "New Chat",
    createdAt: chat.createdAt,
    updatedAt: chat.updatedAt,
    userId: chat.userId,
    privacy: chat.privacy || "private",
    shareId: chat.shareId,
    publicId: chat.publicId,
    source: "local" as const,
    synced: false,
  };
}
