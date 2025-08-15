/**
 * Chat toolbar with Share and Copy buttons
 * Positioned above the message input area
 *
 * ⚠️ IMPORTANT USAGE REQUIREMENTS ⚠️
 * This component should ONLY be rendered when:
 * 1. A chat exists (currentChatId is not null/undefined)
 * 2. There are messages to copy/share (messages.length > 0)
 *
 * NEVER render this toolbar on an empty chat!
 * Users should not see Copy/Share buttons when there's nothing to copy/share.
 *
 * @example Correct usage:
 * ```tsx
 * {currentChatId && messages.length > 0 && (
 *   <ChatToolbar
 *     onShare={openShareModal}
 *     messages={messages}
 *     chatTitle={currentChat?.title}
 *   />
 * )}
 * ```
 *
 * @example WRONG usage (DO NOT DO THIS):
 * ```tsx
 * // ❌ Missing messages.length check
 * {currentChatId && <ChatToolbar ... />}
 *
 * // ❌ Missing currentChatId check
 * {messages.length > 0 && <ChatToolbar ... />}
 *
 * // ❌ No checks at all
 * <ChatToolbar ... />
 * ```
 */

import React from "react";
import { copyToClipboard } from "../lib/clipboard";
import { formatConversationMarkdown } from "../lib/utils";
import type { Message } from "../lib/types/message";
import { toast } from "sonner";

interface ChatToolbarProps {
  /** Handler to open share modal - required for share functionality */
  onShare?: () => void;
  /** Messages to copy - MUST contain at least one message */
  messages?: Message[];
  /** Chat title for formatting the copied content */
  chatTitle?: string;
}

/**
 * Toolbar with Share and Copy buttons for chat conversations.
 *
 * ⚠️ CRITICAL: Parent component MUST ensure messages.length > 0 before rendering!
 * This component does not check if messages array is empty.
 *
 * @param onShare - Handler to open share modal
 * @param messages - Messages to copy (must not be empty)
 * @param chatTitle - Title for formatted output
 */
export function ChatToolbar({
  onShare,
  messages = [],
  chatTitle,
}: ChatToolbarProps) {
  const [copying, setCopying] = React.useState(false);

  const handleCopyAll = React.useCallback(async () => {
    if (messages.length === 0) {
      toast.info("No messages to copy");
      return;
    }

    setCopying(true);
    try {
      const markdown = formatConversationMarkdown({
        title: chatTitle,
        messages: messages.map((m) => ({
          role: m.role,
          content: m.content || "",
          searchResults: m.searchResults,
          sources: m.sources,
        })),
      });

      const success = await copyToClipboard(markdown);
      if (success) {
        toast.success("Conversation copied to clipboard");
      } else {
        toast.error("Failed to copy conversation");
      }
    } catch (error) {
      console.error("Copy failed:", error);
      toast.error("Failed to copy conversation");
    } finally {
      setCopying(false);
    }
  }, [messages, chatTitle]);

  return (
    <div className="flex items-center justify-end gap-2 px-3 sm:px-4 py-2 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
      {/* Copy All Messages Button */}
      <button
        type="button"
        onClick={handleCopyAll}
        disabled={copying || messages.length === 0}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 hover:bg-gray-100 dark:hover:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        aria-label="Copy all messages"
        title="Copy entire conversation"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z"
          />
        </svg>
        <span>{copying ? "Copying..." : "Copy"}</span>
      </button>

      {/* Share Button */}
      <button
        type="button"
        onClick={onShare}
        className="inline-flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-white bg-emerald-500 hover:bg-emerald-600 rounded-lg transition-colors"
        aria-label="Share chat"
        title="Share conversation"
      >
        <svg
          className="w-4 h-4"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z"
          />
        </svg>
        <span>Share</span>
      </button>
    </div>
  );
}
