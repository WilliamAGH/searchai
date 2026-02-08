import type { Message } from "@/lib/types/message";

/** Map a Convex message to the local Message type. */
export function mapPaginatedMessage(
  msg: Message,
  fallbackChatId: string | null,
): Message {
  return {
    ...msg,
    _id: String(msg._id),
    chatId: String(msg.chatId ?? fallbackChatId ?? ""),
    _creationTime: msg._creationTime ?? msg.timestamp ?? Date.now(),
    timestamp: msg.timestamp ?? msg._creationTime ?? Date.now(),
    content: msg.content ?? "",
  };
}

const BACKOFF_BASE_MS = 1000;
const BACKOFF_MAX_MS = 5000;

/** Compute exponential backoff delay (ms) capped at BACKOFF_MAX_MS. */
export function computeBackoffDelay(attempt: number): number {
  const base = Math.pow(2, Math.max(0, attempt - 1));
  return Math.min(BACKOFF_BASE_MS * base, BACKOFF_MAX_MS);
}

function getMessageTime(message: Message): number {
  if (typeof message._creationTime === "number") {
    return message._creationTime;
  }
  if (typeof message.timestamp === "number") {
    return message.timestamp;
  }
  return 0;
}

function messageIdentity(message: Message, index: number): string {
  if (typeof message._id === "string" && message._id.length > 0) {
    return message._id;
  }
  return `${message.role}:${getMessageTime(message)}:${index}`;
}

function mergeChronological(messages: Message[]): Message[] {
  const byId = new Map<string, Message>();
  messages.forEach((message, index) => {
    byId.set(messageIdentity(message, index), message);
  });
  return Array.from(byId.values()).sort(
    (a, b) => getMessageTime(a) - getMessageTime(b),
  );
}

/**
 * Merge the reactive initial page with already-loaded pages without dropping
 * older messages that were fetched via "load more".
 */
export function mergeInitialPageWithLoadedMessages(
  previous: Message[],
  initialPage: Message[],
): Message[] {
  if (previous.length === 0) {
    return initialPage;
  }
  if (initialPage.length === 0) {
    return previous;
  }

  const initialIds = new Set(
    initialPage
      .map((message) =>
        typeof message._id === "string" && message._id.length > 0
          ? message._id
          : null,
      )
      .filter((id): id is string => id !== null),
  );

  const previousWithoutInitial = previous.filter((message) => {
    if (typeof message._id !== "string" || message._id.length === 0) {
      return true;
    }
    return !initialIds.has(message._id);
  });

  return mergeChronological([...previousWithoutInitial, ...initialPage]);
}

/** Merge a newly fetched "older messages" page into existing state. */
export function prependOlderMessages(
  previous: Message[],
  olderPage: Message[],
): Message[] {
  if (olderPage.length === 0) {
    return previous;
  }
  return mergeChronological([...olderPage, ...previous]);
}
