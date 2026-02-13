import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "@/lib/repositories/ChatRepository";
import { createLocalUIMessage } from "@/lib/types/message";
import { IdUtils } from "@/lib/types/unified";
import { getErrorMessage } from "@/lib/utils/errorUtils";
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

export async function sendMessageWithStreaming({
  repository,
  setState,
  chatId,
  content,
  imageStorageIds,
}: SendMessageParams): Promise<void> {
  // Validate inputs
  if (!chatId || (!content && !imageStorageIds?.length)) {
    logger.warn("sendMessage called with invalid parameters", {
      hasRepository: true,
      chatId,
      contentLength: content?.length,
    });
    return;
  }

  // Create user message with unique ID and append immediately so rapid sends
  // are always visible in the UI, even if generation is queued.
  const userMessageId = IdUtils.generateLocalId("msg");
  const userMessage = createLocalUIMessage({
    id: userMessageId,
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

  // Mark generating while anything is queued for this chat, and only clear it
  // when the queue drains. This prevents URL-driven selectChat from replacing
  // optimistic messages mid-flight.
  setState((prev) =>
    prev.currentChatId === chatId ? { ...prev, isGenerating: true } : prev,
  );

  const queued = enqueueChatSend(chatId, async () => {
    // Create assistant placeholder when this message reaches the head of the queue.
    const assistantPlaceholderId = IdUtils.generateLocalId("msg");
    const assistantPlaceholder = createLocalUIMessage({
      id: assistantPlaceholderId,
      chatId,
      role: "assistant",
      content: "",
      isStreaming: true,
      reasoning: "",
      webResearchSources: [],
    });

    // Update state to show assistant placeholder and planning status.
    // NOTE: Do not set currentChatId/currentChat here — URL sync is the
    // single source of truth for chat selection (see docs/contracts/navigation.md).
    setState((prev) => ({
      ...prev,
      error: null,
      searchProgress: {
        stage: "planning",
        message: "Analyzing your question and planning research...",
      },
      messages: [...prev.messages, assistantPlaceholder],
    }));

    try {
      // Send message and get streaming response.
      const generator = repository.generateResponse(
        chatId,
        content,
        imageStorageIds,
      );
      const streamHandler = new StreamEventHandler(
        setState,
        chatId,
        assistantPlaceholderId,
      );

      for await (const chunk of generator) {
        streamHandler.handle(chunk);
      }

      // If persistence wasn't confirmed via SSE, clean up streaming state.
      const persistedConfirmed = streamHandler.getPersistedConfirmed();
      if (!persistedConfirmed) {
        updateMessageById(setState, assistantPlaceholderId, {
          isStreaming: false,
          thinking: undefined,
        });
      }

      // Note: We intentionally skip refresh after persist - optimistic state is source of truth.
      // Refreshing causes UI flickering because DB messages have different IDs.
    } catch (error) {
      logger.error("Failed to send message:", error);
      setState((prev) => ({
        ...prev,
        error: getErrorMessage(error, "Failed to send message"),
      }));
      updateMessageById(setState, assistantPlaceholderId, {
        isStreaming: false,
        thinking: undefined,
      });
    }
  });

  await queued.finally(() => {
    // Only clear busy/progress when the queue is drained for this chat.
    const remaining = chatSendQueues.get(chatId)?.pendingCount ?? 0;
    if (remaining > 0) return;
    setState((prev) =>
      prev.currentChatId === chatId
        ? { ...prev, isGenerating: false, searchProgress: { stage: "idle" } }
        : prev,
    );
  });
}
