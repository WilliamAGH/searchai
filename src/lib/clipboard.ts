/**
 * Clipboard utilities for copying text
 */

import { logger } from "./logger";
import { toWebSourceCards } from "@/lib/domain/webResearchSources";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";
import { extractPlainText } from "../../convex/lib/text";

/**
 * Copy text to clipboard with fallback support
 * @param text - Text to copy to clipboard
 * @returns Promise resolving to success status
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }

    // Fallback for older browsers or non-secure contexts
    const textArea = document.createElement("textarea");
    textArea.value = text;
    textArea.style.position = "fixed";
    textArea.style.left = "-999999px";
    textArea.style.top = "-999999px";
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();

    try {
      const successful = document.execCommand("copy");
      return successful;
    } finally {
      textArea.remove();
    }
  } catch (error) {
    logger.error("Failed to copy text:", error);
    return false;
  }
}

/**
 * Format a conversation with sources included
 * @param messages - Array of messages with potential sources
 * @returns Formatted text with sources between messages
 */
export function formatConversationWithWebResearchSources(
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    webResearchSources?: WebResearchSourceClient[] | undefined;
  }>,
): string {
  const formatted: string[] = [];

  messages.forEach((message, index) => {
    // Add role prefix and content
    const rolePrefix = message.role === "user" ? "User" : "Assistant";
    formatted.push(`${rolePrefix}: ${extractPlainText(message.content)}`);

    // If this is an assistant message with sources, add them after
    if (message.role === "assistant") {
      const sources = toWebSourceCards(message.webResearchSources).map(
        (c) => `  • ${c.title}: ${c.url}`,
      );

      // Add sources section if we have any
      if (sources.length > 0) {
        formatted.push("\nSources:");
        formatted.push(...sources);
      }
    }

    // Add spacing between messages (but not after the last one)
    if (index < messages.length - 1) {
      formatted.push("");
    }
  });

  return formatted.join("\n");
}
