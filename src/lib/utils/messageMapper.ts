// Maps messages to local format for frontend display
// This is a frontend-only utility, not duplicating Convex types

export function mapMessagesToLocal(messages: any[], isAuthenticated: boolean) {
  return messages.map((msg) => ({
    _id: msg.id || msg._id,
    chatId: msg.chatId,
    role: msg.role,
    content: msg.content || "",
    timestamp: msg.timestamp || Date.now(),
    isLocal: !isAuthenticated,
    searchResults: msg.searchResults,
    sources: msg.sources,
    reasoning: msg.reasoning,
  }));
}
