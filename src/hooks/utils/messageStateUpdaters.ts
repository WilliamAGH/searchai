/**
 * Message State Updaters
 *
 * Utility functions for updating message state in chat actions.
 * Extracted per DRY principles to reduce duplication in useChatActions.ts.
 */

import type { Dispatch, SetStateAction } from "react";
import type { ChatState } from "@/hooks/useChatState";
import type { Message } from "@/lib/types/message";

/**
 * Update a specific message by id in chat state.
 *
 * Streaming and rapid-send flows can have multiple assistant placeholders
 * present at once, so "update the last assistant message" is not safe.
 */
export function updateMessageById(
  setState: Dispatch<SetStateAction<ChatState>>,
  messageId: string,
  messageUpdates: Partial<Message>,
  stateUpdates?: Partial<Omit<ChatState, "messages">>,
): void {
  setState((prev) => ({
    ...prev,
    ...stateUpdates,
    messages: prev.messages.map((m) =>
      m._id === messageId ? { ...m, ...messageUpdates } : m,
    ),
  }));
}
