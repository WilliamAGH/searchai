/**
 * @deprecated This file is deprecated. Do not use for rendering dot-only messages.
 * @see MessageItem - Use MessageItem component instead, which properly filters out placeholder content
 *
 * This component previously rendered messages with just dots ("•••", "...", "…")
 * during streaming, but this created duplicate loading animations.
 *
 * The correct approach is to:
 * 1. Use MessageItem component from ./MessageItem
 * 2. MessageItem automatically filters out dot-only content
 * 3. Use StreamingIndicator for showing loading states
 *
 * Migration guide:
 * - Remove any direct rendering of dot-only messages
 * - Use the thinking status in MessageItem for loading states
 * - Use StreamingIndicator component for dedicated loading UI
 */

import React from "react";

/**
 * @deprecated Do not use this component
 * @see MessageItem
 */
export const DeprecatedDotMessage: React.FC = () => {
  console.warn(
    "DeprecatedDotMessage is deprecated. Use MessageItem component instead.",
  );
  return null;
};

/**
 * @deprecated This function is deprecated
 * @see shouldFilterMessage - Use this instead to check if a message should be hidden
 */
export function isOnlyDotsMessage(content: string | undefined | null): boolean {
  console.warn(
    "isOnlyDotsMessage is deprecated. Use shouldFilterMessage instead.",
  );
  if (!content) return true;
  const trimmed = content.trim();
  return (
    trimmed === "•••" || trimmed === "..." || trimmed === "…" || trimmed === ""
  );
}

/**
 * Check if a message should be filtered out (not rendered)
 * This is the correct function to use for filtering placeholder messages
 *
 * @param message - The message to check
 * @returns true if the message should be hidden/filtered
 */
export function shouldFilterMessage(message: {
  content?: string;
  role: string;
}): boolean {
  // Only filter assistant messages with placeholder content
  if (message.role !== "assistant") return false;

  if (!message.content) return true;
  const trimmed = message.content.trim();

  // Filter out any message that's just dots or empty
  return (
    trimmed === "" || trimmed === "•••" || trimmed === "..." || trimmed === "…"
  );
}
