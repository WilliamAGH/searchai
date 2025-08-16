/**
 * Utility functions for formatting shared conversations
 */

import type { SearchResult } from "../../../convex/lib/validators";

interface MessageWithSources {
  role: "user" | "assistant" | "system";
  content: string;
  searchResults?: SearchResult[];
  sources?: string[];
}

/**
 * Format conversation with sources for sharing/copying
 */
export function formatConversationWithSources(
  messages: MessageWithSources[],
): string {
  return messages
    .map((msg) => {
      const role = msg.role === "assistant" ? "Assistant" : "User";
      let formatted = `${role}: ${msg.content}`;

      // Add sources if available
      if (msg.searchResults && msg.searchResults.length > 0) {
        formatted += "\n\nSources:";
        msg.searchResults.forEach((result, index) => {
          formatted += `\n${index + 1}. ${result.title} - ${result.url}`;
        });
      } else if (msg.sources && msg.sources.length > 0) {
        formatted += "\n\nSources:";
        msg.sources.forEach((sourceUrl, index) => {
          formatted += `\n${index + 1}. ${sourceUrl}`;
        });
      }

      return formatted;
    })
    .join("\n\n---\n\n");
}

/**
 * Format a single message for sharing
 */
export function formatMessage(message: MessageWithSources): string {
  return formatConversationWithSources([message]);
}

/**
 * Extract URLs from a message's sources
 */
export function extractSourceUrls(message: MessageWithSources): string[] {
  const urls: string[] = [];

  if (message.searchResults) {
    urls.push(...message.searchResults.map((r) => r.url));
  }

  if (message.sources) {
    urls.push(...message.sources);
  }

  return [...new Set(urls)]; // Remove duplicates
}
