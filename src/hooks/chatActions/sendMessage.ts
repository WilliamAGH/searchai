import type { Dispatch, SetStateAction } from "react";
import type { IChatRepository } from "@/lib/repositories/ChatRepository";
import { createLocalUIMessage } from "@/lib/types/message";
import { IdUtils } from "@/lib/types/unified";
import { getErrorMessage } from "@/lib/utils/errorUtils";
import { logger } from "@/lib/logger";
import type { ChatState } from "@/hooks/useChatState";
import { StreamEventHandler } from "@/hooks/utils/streamHandler";

type SendMessageParams = {
  repository: IChatRepository;
  setState: Dispatch<SetStateAction<ChatState>>;
  chatId: string;
  content: string;
};

export async function sendMessageWithStreaming({
  repository,
  setState,
  chatId,
  content,
}: SendMessageParams): Promise<void> {
  // Validate inputs
  if (!chatId || !content) {
    logger.warn("sendMessage called with invalid parameters", {
      hasRepository: true,
      chatId,
      contentLength: content?.length,
    });
    return;
  }

  // Create user message with unique ID
  const userMessageId = IdUtils.generateLocalId("msg");
  const userMessage = createLocalUIMessage({
    id: userMessageId,
    chatId,
    role: "user",
    content,
  });

  // Create assistant placeholder
  const assistantPlaceholderId = IdUtils.generateLocalId("msg");
  const assistantPlaceholder = createLocalUIMessage({
    id: assistantPlaceholderId,
    chatId,
    role: "assistant",
    content: "",
    isStreaming: true,
    reasoning: "",
    searchResults: [],
    sources: [],
  });

  // Update state to show both user message and assistant placeholder
  setState((prev) => ({
    ...prev,
    isGenerating: true,
    error: null,
    // Immediately show a planning status to avoid initial empty gap
    searchProgress: {
      stage: "planning",
      message: "Analyzing your question and planning research...",
    },
    // Ensure currentChatId and currentChat match the chat we're sending to
    currentChatId: chatId,
    currentChat: prev.chats.find((c) => c._id === chatId) || prev.currentChat,
    messages: [...prev.messages, userMessage, assistantPlaceholder],
  }));

  try {
    // Send message and get streaming response
    const generator = repository.generateResponse(chatId, content);
    const streamHandler = new StreamEventHandler(setState, chatId);

    for await (const chunk of generator) {
      streamHandler.handle(chunk);
    }

    // If persistence wasn't confirmed via SSE, clean up streaming state
    const persistedConfirmed = streamHandler.getPersistedConfirmed();
    if (!persistedConfirmed) {
      setState((prev) => ({
        ...prev,
        isGenerating: false,
        searchProgress: { stage: "idle" },
        messages: prev.messages.map((m, index) =>
          index === prev.messages.length - 1 && m.role === "assistant"
            ? { ...m, isStreaming: false, thinking: undefined }
            : m,
        ),
      }));
    }
    // Note: We intentionally skip refresh after persist - optimistic state is source of truth
    // Refreshing causes UI flickering because DB messages have different IDs
  } catch (error) {
    logger.error("Failed to send message:", error);
    setState((prev) => ({
      ...prev,
      isGenerating: false,
      error: getErrorMessage(error, "Failed to send message"),
      searchProgress: { stage: "idle" },
      // Clear streaming flags on the last assistant message to avoid stuck UI
      messages: prev.messages.map((m, index) =>
        index === prev.messages.length - 1 && m.role === "assistant"
          ? { ...m, isStreaming: false, thinking: undefined }
          : m,
      ),
    }));
  }
}
