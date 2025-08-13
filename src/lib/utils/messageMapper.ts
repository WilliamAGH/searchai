// Maps messages to local format for frontend display
// This is a frontend-only utility, not duplicating Convex types

interface UnifiedMessage {
  id?: string;
  _id?: string;
  chatId: string;
  role: string;
  content?: string;
  timestamp?: number;
  searchResults?: unknown;
  sources?: unknown;
  reasoning?: string;
}

export function mapMessagesToLocal(
  messages: UnifiedMessage[],
  _isAuthenticated: boolean,
) {
  return messages.map((msg) => ({
    _id: msg.id || msg._id,
    chatId: msg.chatId,
    role: msg.role,
    content: msg.content || "",
    timestamp: msg.timestamp || Date.now(),
    isLocal: !_isAuthenticated,
    searchResults: msg.searchResults,
    sources: msg.sources,
    reasoning: msg.reasoning,
  }));
}
