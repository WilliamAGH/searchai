/**
 * Message State Updaters
 *
 * Utility functions for updating message state in chat actions.
 * Extracted per DRY principles to reduce duplication in useChatActions.ts.
 */

import type { Dispatch, SetStateAction } from "react";
import type { ChatState } from "../useChatState";
import type { Message } from "../../lib/types/message";

/**
 * Update the last assistant message in chat state.
 *
 * This helper encapsulates the common pattern of mapping over messages
 * to update only the last assistant message with new properties.
 *
 * @param setState - React state setter for ChatState
 * @param messageUpdates - Partial message fields to merge into the last assistant message
 * @param stateUpdates - Optional additional state fields to merge (e.g., searchProgress)
 *
 * @example
 * // Update content during streaming
 * updateLastAssistantMessage(setState, { content: fullContent, isStreaming: true });
 *
 * @example
 * // Update with additional state changes
 * updateLastAssistantMessage(
 *   setState,
 *   { content: fullContent, isStreaming: true },
 *   { searchProgress: { stage: "generating", message: "Writing answer..." } }
 * );
 */
export function updateLastAssistantMessage(
  setState: Dispatch<SetStateAction<ChatState>>,
  messageUpdates: Partial<Message>,
  stateUpdates?: Partial<Omit<ChatState, "messages">>,
): void {
  setState((prev) => ({
    ...prev,
    ...stateUpdates,
    messages: prev.messages.map((m, index) =>
      index === prev.messages.length - 1 && m.role === "assistant"
        ? { ...m, ...messageUpdates }
        : m,
    ),
  }));
}
