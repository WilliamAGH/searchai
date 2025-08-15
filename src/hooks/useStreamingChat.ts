/**
 * Streaming Chat Hook
 * Provides real-time streaming state from Convex subscriptions
 * Enables instant updates without polling
 */

import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";

export function useStreamingChat(chatId: string | null) {
  const streamingData = useQuery(
    api.chats.subscribeToChatUpdates,
    chatId ? { chatId: chatId as Id<"chats">, sessionId: undefined } : "skip"
  );
  
  return {
    isStreaming: streamingData?.streamingState?.isStreaming ?? false,
    streamingContent: streamingData?.streamingState?.streamedContent ?? "",
    streamingMessageId: streamingData?.streamingState?.messageId,
    thinking: streamingData?.streamingState?.thinking,
    // Additional streaming metadata
    hasStreamingState: !!streamingData?.streamingState,
    lastUpdated: streamingData?.lastUpdated,
  };
}