// Maps messages to local format for frontend display
// This is a frontend-only utility, not duplicating Convex types

import type { UnifiedMessage } from "../types/unified";

export function mapMessagesToLocal(
  messages: UnifiedMessage[],
  _isAuthenticated: boolean,
) {
  return messages.map((msg) => ({
    _id: msg._id || msg.id, // Prefer Convex _id for delete functionality
    chatId: msg.chatId,
    role: msg.role,
    content: msg.content || "",
    timestamp: msg.timestamp || Date.now(),
    isLocal: !_isAuthenticated,
    searchResults: msg.searchResults,
    sources: msg.sources,
    reasoning: msg.reasoning,
    isStreaming: msg.isStreaming,
    streamedContent: msg.streamedContent,
    thinking: msg.thinking,
  }));
}
