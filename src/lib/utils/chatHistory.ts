// Build user history for frontend display

export function buildUserHistory(messages: any[]) {
  return messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content)
    .filter(Boolean);
}
