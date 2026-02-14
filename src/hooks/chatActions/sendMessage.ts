import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "@/lib/repositories/ChatRepository";
import { createLocalUIMessage } from "@/lib/types/message";
import { IdUtils } from "@/lib/types/unified";
import { getErrorMessage } from "../../../convex/lib/errors";
import { logger } from "@/lib/logger";
import type { ChatState } from "@/hooks/useChatState";
import { StreamEventHandler } from "@/hooks/utils/streamHandler";
import { updateMessageById } from "@/hooks/utils/messageStateUpdaters";

type SendMessageParams = {
  repository: IChatRepository;
  setState: Dispatch<SetStateAction<ChatState>>;
  chatId: string;
  content: string;
  imageStorageIds?: string[];
};

type ChatSendQueueState = {
  tail: Promise<void>;
  pendingCount: number;
};

// Per-chat queue to ensure we never run multiple streaming generators concurrently
// for the same chat. This prevents interleaved state updates and data loss when
// users send messages rapidly.
const chatSendQueues = new Map<string, ChatSendQueueState>();

function enqueueChatSend(
  chatId: string,
  task: () => Promise<void>,
): Promise<void> {
  const existing =
    chatSendQueues.get(chatId) ??
    ({ tail: Promise.resolve(), pendingCount: 0 } satisfies ChatSendQueueState);

  existing.pendingCount += 1;

  const run = async () => {
    try {
      await task();
    } finally {
      existing.pendingCount -= 1;
      if (existing.pendingCount <= 0) {
        chatSendQueues.delete(chatId);
      }
    }
  };

  // Ensure later tasks run even if an earlier one throws.
  existing.tail = existing.tail.then(run, run);
  chatSendQueues.set(chatId, existing);
  return existing.tail;
}

/** Append a user message to state immediately so rapid sends are always visible. */
function appendUserMessage(
  setState: Dispatch<SetStateAction<ChatState>>,
  chatId: string,
  content: string,
  imageStorageIds?: string[],
): void {
  const userMessage = createLocalUIMessage({
    id: IdUtils.generateLocalId("msg"),
    chatId,
    role: "user",
    content,
    imageStorageIds,
  });
  setState((prev) => ({
    ...prev,
    error: null,
    messages: [...prev.messages, userMessage],
  }));
}

/** Flag the chat as generating. Prevents selectChat from replacing optimistic messages. */
function markGenerating(
  setState: Dispatch<SetStateAction<ChatState>>,
  chatId: string,
): void {
  setState((prev) =>
    prev.currentChatId === chatId ? { ...prev, isGenerating: true } : prev,
  );
}

/** Clear busy/progress flags only when the per-chat queue has fully drained.
 *
 * By the time this runs the current chat's queue entry has already been deleted
 * inside enqueueChatSend's finally block. If *other* chats still have active
 * queues we must not reset the global isGenerating flag because those streams
 * are still in progress.
 */
function clearGeneratingOnDrain(
  setState: Dispatch<SetStateAction<ChatState>>,
  _chatId: string,
): void {
  // Another chat is still streaming — keep isGenerating true.
  if (chatSendQueues.size > 0) return;
  setState((prev) => ({
    ...prev,
    isGenerating: false,
    searchProgress: { stage: "idle" },
  }));
}

/** Create an assistant placeholder message and append it with planning status. */
function appendAssistantPlaceholder(
  setState: Dispatch<SetStateAction<ChatState>>,
  chatId: string,
): string {
  const placeholderId = IdUtils.generateLocalId("msg");
  const placeholder = createLocalUIMessage({
    id: placeholderId,
    chatId,
    role: "assistant",
    content: "",
    isStreaming: true,
    reasoning: "",
    webResearchSources: [],
  });
  // NOTE: Do not set currentChatId/currentChat here — URL sync is the
  // single source of truth for chat selection (see docs/contracts/navigation.md).
  setState((prev) => ({
    ...prev,
    error: null,
    searchProgress: {
      stage: "planning",
      message: "Analyzing your question and planning research...",
    },
    messages: [...prev.messages, placeholder],
  }));
  return placeholderId;
}

/** Stream the assistant response and handle errors. */
async function streamAssistantResponse({
  repository,
  setState,
  chatId,
  content,
  imageStorageIds,
}: SendMessageParams): Promise<void> {
  const placeholderId = appendAssistantPlaceholder(setState, chatId);

  try {
    const generator = repository.generateResponse(
      chatId,
      content,
      imageStorageIds,
    );
    const handler = new StreamEventHandler(setState, chatId, placeholderId);

    for await (const chunk of generator) {
      handler.handle(chunk);
    }

    if (!handler.getPersistedConfirmed()) {
      updateMessageById(setState, placeholderId, {
        isStreaming: false,
        thinking: undefined,
      });
    }
  } catch (error) {
    logger.error("Failed to send message:", error);
    setState((prev) => ({
      ...prev,
      error: getErrorMessage(error, "Failed to send message"),
    }));
    updateMessageById(setState, placeholderId, {
      isStreaming: false,
      thinking: undefined,
    });
  }
}

export async function sendMessageWithStreaming(
  params: SendMessageParams,
): Promise<void> {
  const { setState, chatId, content, imageStorageIds } = params;

  if (!chatId || (!content && !imageStorageIds?.length)) {
    logger.warn("sendMessage called with invalid parameters", {
      hasRepository: true,
      chatId,
      contentLength: content?.length,
    });
    return;
  }

  appendUserMessage(setState, chatId, content, imageStorageIds);
  markGenerating(setState, chatId);

  const queued = enqueueChatSend(chatId, () => streamAssistantResponse(params));
  await queued.finally(() => clearGeneratingOnDrain(setState, chatId));
}
