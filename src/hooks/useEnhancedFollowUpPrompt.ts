import { useState, useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import { logger } from "@/lib/logger";
import type { Id } from "../../convex/_generated/dataModel";
import { toConvexId } from "@/lib/utils/idValidation";
import { isTopicChange } from "@/lib/utils/topicDetection";

interface UseEnhancedFollowUpPromptProps {
  currentChatId: string | null;
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  sendRef: MutableRefObject<((message: string) => Promise<void>) | null>;
  summarizeRecentAction?: (args: { chatId: Id<"chats"> }) => Promise<string>;
  chatState: {
    messages?: Array<{ role?: string; content?: string }>;
    isGenerating?: boolean;
  } | null;
}

interface FollowUpCheckResult {
  shouldShow: boolean;
  suggestions: string[];
  pendingMessage: string | null;
}

/** Check if follow-up prompt should be shown based on message history */
function checkFollowUpConditions(
  messages: Array<{ role?: string; content?: string }>,
  isGenerating: boolean | undefined,
): FollowUpCheckResult {
  const userMessages = messages.filter((m) => m?.role === "user");
  const assistantMessages = messages.filter((m) => m?.role === "assistant");

  // Require at least 4 user messages before ever showing the prompt
  if (userMessages.length < 4 || assistantMessages.length === 0) {
    return { shouldShow: false, suggestions: [], pendingMessage: null };
  }

  const lastMessage = messages[messages.length - 1];
  const hasUserHistory = messages.some((m) => m?.role === "user");
  const lastUserMessage = userMessages[userMessages.length - 1];
  const previousUserMessage = userMessages[userMessages.length - 2];

  if (
    !hasUserHistory ||
    lastMessage?.role !== "assistant" ||
    !lastMessage.content ||
    !lastUserMessage?.content ||
    !previousUserMessage?.content
  ) {
    return { shouldShow: false, suggestions: [], pendingMessage: null };
  }

  // Only show if there's a topic change
  const hasTopicChanged = isTopicChange(lastUserMessage.content, previousUserMessage.content);

  if (hasTopicChanged) {
    const suggestions = generateFollowUpSuggestions(lastMessage.content);
    return {
      shouldShow: suggestions.length > 0 && !isGenerating,
      suggestions,
      pendingMessage: lastUserMessage.content,
    };
  }

  return { shouldShow: false, suggestions: [], pendingMessage: null };
}

function generateFollowUpSuggestions(content: string): string[] {
  const suggestions: string[] = [];
  const contentLower = content.toLowerCase();

  if (contentLower.includes("code")) {
    suggestions.push("Can you explain this code in more detail?");
    suggestions.push("How can I test this implementation?");
  }

  if (contentLower.includes("error")) {
    suggestions.push("What causes this error?");
    suggestions.push("How can I debug this issue?");
  }

  if (suggestions.length === 0) {
    suggestions.push("Tell me more about this");
    suggestions.push("What are the alternatives?");
  }

  return suggestions.slice(0, 3);
}

/**
 * Hook to manage enhanced follow-up prompts and chat continuations
 */
export function useEnhancedFollowUpPrompt({
  currentChatId,
  handleNewChat,
  sendRef,
  summarizeRecentAction,
  chatState,
}: UseEnhancedFollowUpPromptProps) {
  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [plannerHint, setPlannerHint] = useState<{
    reason?: string;
    confidence?: number;
  } | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);
  const [summaryError, setSummaryError] = useState<Error | null>(null);

  // Generate follow-up suggestions based on last assistant message
  useEffect(() => {
    const messages = chatState?.messages || [];
    const result = checkFollowUpConditions(messages, chatState?.isGenerating);

    if (result.shouldShow) {
      setFollowUpSuggestions(result.suggestions);
      setPendingMessage(result.pendingMessage);
      setShowFollowUpPrompt(true);
    } else {
      setShowFollowUpPrompt(false);
    }
  }, [chatState?.messages, chatState?.isGenerating]);

  const resetFollowUp = useCallback(() => {
    setShowFollowUpPrompt(false);
    setFollowUpSuggestions([]);
    setPendingMessage(null);
    setPlannerHint(null);
    setSummaryError(null);
  }, []);

  const maybeShowFollowUpPrompt = useCallback(() => {
    const messages = chatState?.messages || [];
    const result = checkFollowUpConditions(messages, chatState?.isGenerating);

    if (result.shouldShow) {
      setPendingMessage(result.pendingMessage);
      setShowFollowUpPrompt(true);
    }
  }, [chatState?.messages, chatState?.isGenerating]);

  const handleContinueChat = useCallback(() => {
    resetFollowUp();
  }, [resetFollowUp]);

  const handleNewChatForFollowUp = useCallback(async () => {
    const messageToSend = pendingMessage;
    resetFollowUp();
    if (messageToSend) {
      setPendingMessage(messageToSend);
    }
    await handleNewChat({ userInitiated: true });
  }, [handleNewChat, pendingMessage, resetFollowUp]);

  const handleNewChatWithSummary = useCallback(async () => {
    const messageToSend = pendingMessage;
    resetFollowUp();
    if (messageToSend) {
      setPendingMessage(messageToSend);
    }

    if (summarizeRecentAction && currentChatId) {
      const convexChatId = toConvexId<"chats">(currentChatId);
      if (!convexChatId) {
        await handleNewChat({ userInitiated: true });
        return;
      }
      try {
        const summary = await summarizeRecentAction({
          chatId: convexChatId,
        });
        setPlannerHint({ reason: String(summary) });
      } catch (err) {
        const error = err instanceof Error ? err : new Error(String(err));
        logger.error("Failed to summarize recent chat:", error);
        setSummaryError(error);
        // Continue with new chat creation despite summary failure
      }
    }

    await handleNewChat({ userInitiated: true });
  }, [currentChatId, handleNewChat, pendingMessage, resetFollowUp, summarizeRecentAction]);

  // Send pending message when chat is ready
  useEffect(() => {
    if (pendingMessage && currentChatId && sendRef.current) {
      const sendMessage = async () => {
        await sendRef.current?.(pendingMessage);
        setPendingMessage(null);
      };
      void sendMessage();
    }
  }, [pendingMessage, currentChatId, sendRef]);

  return {
    showFollowUpPrompt,
    pendingMessage,
    plannerHint,
    resetFollowUp,
    maybeShowFollowUpPrompt,
    setPendingMessage,
    handleContinueChat,
    handleNewChatForFollowUp,
    handleNewChatWithSummary,
    followUpSuggestions,
    /** Error from last summarization attempt, if any. Callers can use this to show UI feedback. */
    summaryError,
  };
}
