/**
 * Clipboard utilities for copying text
 */

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
    console.error("Failed to copy text:", error);
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
