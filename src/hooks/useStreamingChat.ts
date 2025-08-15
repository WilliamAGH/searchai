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
};

const defaultStreamingState: StreamingState = {
  isStreaming: false,
  streamingContent: "",
  streamingMessageId: undefined,
  thinking: undefined,
  hasStreamingState: false,
  lastUpdated: undefined,
};

export function useStreamingChat(
  chatId: string | null,
  sessionId?: string | null,
): StreamingState {
  const [localState, setLocalState] = useState<StreamingState>(
    defaultStreamingState,
  );

  const streamingData = useQuery(
    api.chats.subscribeToChatUpdates,
    chatId
      ? { chatId: chatId as Id<"chats">, sessionId: sessionId || undefined }
      : "skip",
  );

  // Clear streaming state when chat changes
  useEffect(() => {
    setLocalState(defaultStreamingState);
  }, [chatId]);

  // Update local state when streaming data changes
  useEffect(() => {
    if (streamingData?.streamingState) {
      setLocalState({
        isStreaming: streamingData.streamingState.isStreaming ?? false,
        // Use 'content' which has the full accumulated content, not 'streamedContent' which is just the chunk
        streamingContent: streamingData.streamingState.content ?? "",
        streamingMessageId: streamingData.streamingState.messageId,
        thinking: streamingData.streamingState.thinking,
        hasStreamingState: true,
        lastUpdated: streamingData.lastUpdated,
      });
    } else if (streamingData && !streamingData.streamingState) {
      // Chat data exists but no streaming state
      setLocalState(defaultStreamingState);
    }
  }, [streamingData]);

  return localState;
}
