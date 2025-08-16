// Maps messages to local format for frontend display
// This is a frontend-only utility, not duplicating Convex types

import type { UnifiedMessage } from "../types/unified";

export function mapMessagesToLocal(
  messages: UnifiedMessage[],
  _isAuthenticated: boolean,
) {
  return messages.map((msg, index) => {
    // Ensure we always have an _id for React keys and delete functionality
    const messageId =
      msg._id || msg.id || `fallback-msg-${index}-${Date.now()}`;

    return {
      _id: messageId,
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
    };
  });
}
