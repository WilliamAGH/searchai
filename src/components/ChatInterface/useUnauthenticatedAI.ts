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
        // Create user message if not already present
        const userMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_user`;
        const userMessage = {
          id: userMessageId,
          chatId,
          role: "user" as const,
          content: message,
          timestamp: Date.now(),
          source: "local" as const,
          synced: false,
        };

        // Check if the last message is already this user message to avoid duplicates
        const lastMessage = chatState.messages[chatState.messages.length - 1];
        if (
          !lastMessage ||
          lastMessage.content !== message ||
          lastMessage.role !== "user"
        ) {
          chatActions.addMessage(userMessage);
        }

        // Create assistant message to track streaming
        const assistantMessageId = `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}_assistant`;
        const assistantMessage = {
          id: assistantMessageId,
          chatId,
          role: "assistant" as const,
          content: "",
          timestamp: Date.now(),
          source: "local" as const,
          synced: false,
          isStreaming: true,
          hasStartedContent: false,
          reasoning: "", // Add reasoning field
          searchResults: [], // Initialize empty
          sources: [], // Initialize empty
        };
        chatActions.addMessage(assistantMessage);

        logger.info("[useUnauthenticatedAI] Created messages", {
          userMessageId,
          assistantMessageId,
          chatId,
        });

        // Track accumulated content locally
        let accumulatedContent = "";
        let accumulatedThinking = "";
        let hasReceivedSearchResults = false;
        let searchResultsToDisplay: unknown[] = [];
        let sourcesToDisplay: string[] = [];

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
                chunkNumber?: number;
              };

              // Handle search results from the first chunk that has them
              if (
                !hasReceivedSearchResults &&
                data.searchResults &&
                data.searchResults.length > 0
              ) {
                hasReceivedSearchResults = true;
                searchResultsToDisplay = data.searchResults;
                sourcesToDisplay = data.sources || [];

                logger.info("[useUnauthenticatedAI] Search results received", {
                  count: searchResultsToDisplay.length,
                  sources: sourcesToDisplay.length,
                });
              }

              // Handle thinking/reasoning content
              if (data.thinking) {
                accumulatedThinking += data.thinking;
                logger.debug("[useUnauthenticatedAI] Thinking chunk received", {
                  thinkingLength: data.thinking.length,
                  totalThinking: accumulatedThinking.length,
                });
              }

              if (data.type === "chunk") {
                // Accumulate content
                if (data.content) {
                  accumulatedContent += data.content;
                }

                // Update message with all accumulated data
                chatActions.updateMessage(assistantMessageId, {
                  content: accumulatedContent,
                  reasoning: accumulatedThinking,
                  hasStartedContent:
                    accumulatedContent.length > 0 ||
                    accumulatedThinking.length > 0,
                  searchResults: searchResultsToDisplay,
                  sources: sourcesToDisplay,
                  isStreaming: true,
                });

                logger.debug("[useUnauthenticatedAI] Chunk processed", {
                  messageId: assistantMessageId,
                  chunkNumber: data.chunkNumber,
                  contentLength: accumulatedContent.length,
                  thinkingLength: accumulatedThinking.length,
                  hasSearchResults: hasReceivedSearchResults,
                });
              }
            }
          },
          [], // searchResults
          [], // sources
          chatState.messages.map((m) => ({
            role: m.role,
            content: m.content,
          })), // chatHistory
          () => {
            // onComplete callback - mark message as done streaming
            chatActions.updateMessage(assistantMessageId, {
              isStreaming: false,
              content:
                accumulatedContent ||
                "I'm sorry, I couldn't generate a response. Please try again.",
              reasoning: accumulatedThinking,
              searchResults: searchResultsToDisplay,
              sources: sourcesToDisplay,
            });
            logger.info("[useUnauthenticatedAI] AI response completed", {
              messageId: assistantMessageId,
              contentLength: accumulatedContent.length,
              thinkingLength: accumulatedThinking.length,
              hasContent: accumulatedContent.length > 0,
              hasThinking: accumulatedThinking.length > 0,
              hasSearchResults: searchResultsToDisplay.length > 0,
            });
          },
        );
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") {
          logger.info("[useUnauthenticatedAI] Request aborted");
          return;
        }
        logger.error("[useUnauthenticatedAI] AI generation failed:", error);

        // Update the message to show an error
        if (assistantMessageId) {
          chatActions.updateMessage(assistantMessageId, {
            content:
              "I encountered an error while generating a response. Please try again.",
            isStreaming: false,
            error: true,
          });
        }
      }
    },
    [chatState.messages, chatActions, aiService],
  );

  return {
    generateUnauthenticatedResponse,
    abortControllerRef,
  };
}
