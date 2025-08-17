/**
 * Clipboard utilities for copying text
 *
 * @module clipboard
 * @description Safe clipboard operations with iOS Safari protection
 */

import { logger } from "./logger";
import { isIOSSafari, safeFocus, safeSelect } from "./utils/ios";

/**
 * Copy text to clipboard with fallback support and iOS Safari protection
 *
 * @description Safely copies text to clipboard with multiple fallback mechanisms.
 * Includes special handling for iOS Safari to prevent keyboard crashes during
 * the copy operation.
 *
 * @param {string} text - Text to copy to clipboard
 *
 * @returns {Promise<boolean>} Promise resolving to true if copy was successful, false otherwise
 *
 * @remarks
 * - Prefers modern Clipboard API when available
 * - Falls back to execCommand for older browsers
 * - Skips focus/select operations on iOS Safari to prevent crashes
 * - Handles both secure and non-secure contexts
 *
 * @example
 * ```typescript
 * const success = await copyToClipboard('Hello, world!');
 * if (success) {
 *   toast.success('Copied to clipboard!');
 * } else {
 *   toast.error('Failed to copy');
 * }
 * ```
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    // Prefer modern Clipboard API when available
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

    /**
     * CRITICAL iOS Safari Fix: We must be very careful with focus and select
     * operations on iOS Safari as they can trigger keyboard crashes.
     * On iOS Safari, we skip these operations and rely on the execCommand
     * to work without them (which it often does).
     */
    if (!isIOSSafari()) {
      // Only focus and select on non-iOS Safari browsers
      safeFocus(textArea, { preventScroll: true });
      safeSelect(textArea);
    } else {
      // On iOS Safari, try to select without focus
      // This sometimes works and avoids the keyboard crash
      try {
        textArea.setSelectionRange(0, text.length);
      } catch {
        // If selection fails, continue anyway
        logger.warn(
          "[Clipboard] iOS Safari: Selection skipped to prevent crash",
        );
      }
    }

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
 * Extract plain text from message content
 * @param content - Message content (may contain markdown/HTML)
 * @returns Plain text content
 */
export function extractPlainText(content: string): string {
  // Remove markdown links [text](url) -> text
  let text = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");

  // Remove bold/italic markers
  text = text.replace(/[*_]{1,2}([^*_]+)[*_]{1,2}/g, "$1");

  // Remove inline code markers
  text = text.replace(/`([^`]+)`/g, "$1");

  // Remove code blocks
  text = text.replace(/```[^`]*```/g, "");

  // Remove HTML tags if any
  text = text.replace(/<[^>]*>/g, "");

  // Normalize whitespace
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

/**
 * Format a conversation with sources included
 * @param messages - Array of messages with potential sources
 * @returns Formatted text with sources between messages
 */
export function formatConversationWithSources(
  messages: Array<{
    role: "user" | "assistant" | "system";
    content: string;
    searchResults?: Array<{ title: string; url: string }>;
    sources?: string[];
  }>,
): string {
  const formatted: string[] = [];

  messages.forEach((message, index) => {
    // Add role prefix and content
    const rolePrefix = message.role === "user" ? "User" : "Assistant";
    formatted.push(`${rolePrefix}: ${extractPlainText(message.content)}`);

    // If this is an assistant message with sources, add them after
    if (message.role === "assistant") {
      const sources: string[] = [];

      // Collect sources from searchResults
      if (message.searchResults && message.searchResults.length > 0) {
        message.searchResults.forEach((result) => {
          if (result.url && result.title) {
            sources.push(`  • ${result.title}: ${result.url}`);
          }
        });
      }

      // Also collect from sources array if present
      if (message.sources && message.sources.length > 0) {
        // Only add if not already in searchResults
        message.sources.forEach((sourceUrl) => {
          const alreadyIncluded = message.searchResults?.some(
            (r) => r.url === sourceUrl,
          );
          if (!alreadyIncluded) {
            sources.push(`  • ${sourceUrl}`);
          }
        });
      }

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
