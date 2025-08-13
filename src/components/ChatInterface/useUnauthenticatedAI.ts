/**
 * Hook for handling unauthenticated AI response generation
 */

import { useCallback, useRef, useEffect } from "react";
import { logger } from "../../lib/logger";
import type { ChatActions, ChatState } from "../../hooks/types";
import type { UnauthenticatedAIService } from "../../lib/services/UnauthenticatedAIService";

interface UseUnauthenticatedAIProps {
  chatState: ChatState;
  chatActions: ChatActions;
  aiService: UnauthenticatedAIService | null;
}

export function useUnauthenticatedAI({
  chatState,
  chatActions,
  aiService,
}: UseUnauthenticatedAIProps) {
  const abortControllerRef = useRef<AbortController | null>(null);

  useEffect(
    () => () => {
      abortControllerRef.current?.abort();
      aiService?.abort();
    },
    [aiService],
  );

  const generateUnauthenticatedResponse = useCallback(
    async (message: string, chatId: string) => {
      try {
        // Create assistant message to track streaming
        const assistantMessage = {
          id: `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
          chatId,
          role: "assistant" as const,
          content: "",
          timestamp: Date.now(),
          source: "local" as const,
          synced: false,
          isStreaming: true,
          hasStartedContent: false,
        };
        chatActions.addMessage(assistantMessage);

        // Generate response with proper parameters
        await aiService?.generateResponse(
          message,
          chatId,
          (chunk: unknown) => {
            // Handle SSE chunks from the backend
            if (typeof chunk === "object" && chunk !== null) {
              const data = chunk as {
                type?: string;
                content?: string;
                thinking?: string;
                searchResults?: unknown[];
                sources?: string[];
              };

              if (data.type === "chunk" && data.content) {
                // Update message content incrementally
                chatActions.updateMessage(assistantMessage.id, {
                  content: (assistantMessage.content || "") + data.content,
                  hasStartedContent: true,
                  searchResults: data.searchResults,
                  sources: data.sources,
                });
                assistantMessage.content =
                  (assistantMessage.content || "") + data.content;
              }
            }
          },
          [], // searchResults
          [], // sources
          chatState.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })), // chatHistory
        );

        // Mark message as done streaming
        chatActions.updateMessage(assistantMessage.id, {
          isStreaming: false,
        });
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") return;
        logger.error("AI generation failed:", error);
      }
    },
    [chatState.messages, chatActions, aiService],
  );

  return {
    generateUnauthenticatedResponse,
    abortControllerRef,
  };
}
