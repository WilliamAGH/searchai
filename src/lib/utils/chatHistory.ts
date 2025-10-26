// Build user history for frontend display

type BasicMessage = { role?: string; content?: string };

export function buildUserHistory(messages: unknown[]) {
  return (messages as BasicMessage[])
    .filter((msg) => msg?.role === "user")
    .map((msg) => msg?.content ?? "")
    .filter((s) => Boolean(s));
}
