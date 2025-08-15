/**
 * Streaming Chat Hook
 * Provides real-time streaming state from Convex subscriptions
 * Enables instant updates without polling
 */

import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export type StreamingState = {
  isStreaming: boolean;
  streamingContent: string;
  streamingMessageId?: Id<"messages"> | string;
  thinking?: string;
  hasStreamingState: boolean;
  lastUpdated?: number;
  // NEW: Include messages from real-time subscription
  messages?: Array<unknown>;
};

const defaultStreamingState: StreamingState = {
  isStreaming: false,
  streamingContent: "",
  streamingMessageId: undefined,
  thinking: undefined,
  hasStreamingState: false,
  lastUpdated: undefined,
  messages: undefined,
};

// Runtime type guard for Convex ID validation
function isConvexChatId(id: string): id is Id<"chats"> {
  // Convex IDs are 32-character alphanumeric strings
  // This pattern matches the actual Convex ID format
  return /^[0-9a-z]{32}$/.test(id);
}

export function useStreamingChat(
  chatId: string | null,
  sessionId?: string | null,
): StreamingState {
  const [localState, setLocalState] = useState<StreamingState>(
    defaultStreamingState,
  );

  const streamingData = useQuery(
    api.chats.subscribeToChatUpdates,
    chatId && isConvexChatId(chatId)
      ? { chatId, sessionId: sessionId || undefined }
      : "skip",
  );

  // Clear streaming state when chat changes
  useEffect(() => {
    setLocalState(defaultStreamingState);
  }, [chatId]);

  // Update local state when streaming data changes
  useEffect(() => {
    if (streamingData?.streamingState) {
      // FIXED: Use content field directly from backend which contains accumulated content
      // The backend sends accumulated content in the 'content' field during streaming
      const accumulatedContent = streamingData.streamingState.content || "";

      setLocalState({
        isStreaming: streamingData.streamingState.isStreaming ?? false,
        streamingContent: accumulatedContent,
        streamingMessageId: streamingData.streamingState.messageId,
        thinking: streamingData.streamingState.thinking,
        hasStreamingState: true,
        lastUpdated: streamingData.lastUpdated,
        // NEW: Include messages from the subscription for real-time updates
        messages: streamingData.messages,
      });
    } else if (streamingData && !streamingData.streamingState) {
      // Chat data exists but no streaming state
      setLocalState({
        ...defaultStreamingState,
        // Still include messages even when not streaming
        messages: streamingData?.messages,
      });
    }
  }, [streamingData]);

  return localState;
}
