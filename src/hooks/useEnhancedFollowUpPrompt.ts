import { useState, useCallback, useEffect } from "react";
import type { MutableRefObject } from "react";
import { logger } from "../lib/logger";
import { isTopicChange } from "../lib/utils/topicDetection";

interface UseEnhancedFollowUpPromptProps {
  isAuthenticated: boolean;
  currentChatId: string | null;
  handleNewChat: (opts?: { userInitiated?: boolean }) => Promise<string | null>;
  sendRef: MutableRefObject<((message: string) => Promise<void>) | null>;
  recordClientMetric?: unknown;
  summarizeRecentAction?: unknown;
  chatState: {
    messages?: Array<{ role?: string; content?: string }>;
    isGenerating?: boolean;
  } | null;
}

/**
 * Hook to manage enhanced follow-up prompts and chat continuations
 */
export function useEnhancedFollowUpPrompt({
  isAuthenticated: _isAuthenticated,
  currentChatId,
  handleNewChat,
  sendRef,
  recordClientMetric: _recordClientMetric,
  summarizeRecentAction,
  chatState,
}: UseEnhancedFollowUpPromptProps) {
  const [showFollowUpPrompt, setShowFollowUpPrompt] = useState(false);
  const [pendingMessage, setPendingMessage] = useState<string | null>(null);
  const [plannerHint, setPlannerHint] = useState<string | null>(null);
  const [followUpSuggestions, setFollowUpSuggestions] = useState<string[]>([]);

  // Generate follow-up suggestions based on last assistant message
  useEffect(() => {
    const messages = chatState?.messages || [];
    // Require at least 4 user messages before ever showing the prompt
    const userMessages = messages.filter((m) => m?.role === "user");
    const assistantMessages = messages.filter((m) => m?.role === "assistant");
    if (userMessages.length < 4 || assistantMessages.length === 0) {
      setShowFollowUpPrompt(false);
      return;
    }

    const lastMessage = messages[messages.length - 1];
    const hasUserHistory = messages.some((m) => m?.role === "user");

    // Check for actual topic change before showing prompt
    const lastUserMessage = userMessages[userMessages.length - 1];
    const previousUserMessage = userMessages[userMessages.length - 2];

    if (
      hasUserHistory &&
      lastMessage?.role === "assistant" &&
      lastMessage.content &&
      lastUserMessage?.content &&
      previousUserMessage?.content
    ) {
      // Only show if there's a topic change
      const hasTopicChanged = isTopicChange(
        lastUserMessage.content,
        previousUserMessage.content,
      );

      if (hasTopicChanged) {
        // Simple follow-up generation - can be enhanced with AI
        const suggestions = generateFollowUpSuggestions(lastMessage.content);
        setFollowUpSuggestions(suggestions);
        // Show follow-up if there are suggestions and not currently generating
        if (suggestions.length > 0 && !chatState?.isGenerating) {
          setShowFollowUpPrompt(true);
        }
      } else {
        // No topic change, don't show the prompt
        setShowFollowUpPrompt(false);
      }
    }
  }, [chatState?.messages, chatState?.isGenerating]);

  const resetFollowUp = useCallback(() => {
    setShowFollowUpPrompt(false);
    setFollowUpSuggestions([]);
    setPendingMessage(null);
    setPlannerHint(null);
  }, []);

  const maybeShowFollowUpPrompt = useCallback(() => {
    // Only consider showing after sufficient conversation history
    const messages = chatState?.messages || [];
    if (chatState?.isGenerating) return;

    const userMessages = messages.filter((m) => m?.role === "user");
    const assistantMessages = messages.filter((m) => m?.role === "assistant");

    // Require at least 4 user messages to avoid premature prompts
    if (userMessages.length < 4 || assistantMessages.length < 1) {
      return;
    }

    // Get the last two user messages to check for topic change
    const lastUserMessage = userMessages[userMessages.length - 1];
    const previousUserMessage = userMessages[userMessages.length - 2];

    if (lastUserMessage?.content && previousUserMessage?.content) {
      // Only show follow-up prompt if there's an actual topic change
      const hasTopicChanged = isTopicChange(
        lastUserMessage.content,
        previousUserMessage.content,
      );

      if (hasTopicChanged) {
        setShowFollowUpPrompt(true);
      }
    }
  }, [chatState?.messages, chatState?.isGenerating]);

  const handleContinueChat = useCallback(
    async (message: string) => {
      // Continue in current chat
      if (sendRef.current && currentChatId) {
        resetFollowUp();
        await sendRef.current(message);
      }
    },
    [currentChatId, sendRef, resetFollowUp],
  );

  const handleNewChatForFollowUp = useCallback(
    async (message: string) => {
      // Create new chat and send message
      resetFollowUp();
      const newChatId = await handleNewChat({ userInitiated: true });
      if (newChatId && sendRef.current) {
        // Set pending message to be sent after chat creation
        setPendingMessage(message);
      }
    },
    [handleNewChat, resetFollowUp, sendRef],
  );

  const handleNewChatWithSummary = useCallback(
    async (message: string) => {
      // Create new chat with summary from previous chat
      resetFollowUp();

      // Optionally summarize recent conversation
      if (summarizeRecentAction && currentChatId) {
        try {
          const summary = await summarizeRecentAction({
            chatId: currentChatId,
          });
          setPlannerHint(summary);
        } catch (error) {
          logger.error("Failed to summarize recent chat:", error);
        }
      }

      const newChatId = await handleNewChat({ userInitiated: true });
      if (newChatId && sendRef.current) {
        setPendingMessage(message);
      }
    },
    [
      currentChatId,
      handleNewChat,
      resetFollowUp,
      sendRef,
      summarizeRecentAction,
    ],
  );

  // Send pending message when chat is ready
  useEffect(() => {
    if (pendingMessage && currentChatId && sendRef.current) {
      const sendMessage = async () => {
        await sendRef.current?.(pendingMessage);
        setPendingMessage(null);
      };
      sendMessage();
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
  };
}

function generateFollowUpSuggestions(content: string): string[] {
  const suggestions: string[] = [];

  // Generate contextual suggestions based on content
  if (content.toLowerCase().includes("code")) {
    suggestions.push("Can you explain this code in more detail?");
    suggestions.push("How can I test this implementation?");
  }

  if (content.toLowerCase().includes("error")) {
    suggestions.push("What causes this error?");
    suggestions.push("How can I debug this issue?");
  }

  // Default suggestions if no specific context
  if (suggestions.length === 0) {
    suggestions.push("Tell me more about this");
    suggestions.push("What are the alternatives?");
  }

  return suggestions.slice(0, 3); // Limit to 3 suggestions
}
