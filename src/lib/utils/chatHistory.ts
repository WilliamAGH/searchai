// Build user history for frontend display

import type { Message } from "@/lib/types/message";

type UserHistoryMessage = Pick<Message, "role" | "content">;

export function buildUserHistory(messages: UserHistoryMessage[]) {
  return messages
    .filter((msg) => msg.role === "user")
    .map((msg) => msg.content ?? "")
    .filter((s) => Boolean(s));
}
