/**
 * Chat toolbar with Share and Copy icon buttons
 * Positioned at the bottom of the message list
 *
 * 🎯 DESIGN PRINCIPLES:
 * - Icon-only buttons for minimal visual footprint
 * - Matches the app's icon button patterns (see CopyButton component)
 * - Subtle styling that doesn't dominate the interface
 * - Right-aligned to keep focus on conversation
 *
 * ⚠️ CRITICAL USAGE REQUIREMENTS ⚠️
 * This component should ONLY be rendered when ALL conditions are met:
 * 1. A chat exists in Convex (currentChatId is not null/undefined)
 * 2. Chat has been persisted (not just local/temporary)
 * 3. There are messages to copy/share (messages.length > 0)
 * 4. At least one assistant message exists (not just user messages)
 *
 * NEVER render this toolbar:
 * - On an empty chat
 * - Before the first assistant response
 * - For local/temporary chats without Convex IDs
 *
 * @example Correct usage in ChatLayout:
 * ```tsx
 * {currentChatId &&
 *  messageListProps.messages?.length > 0 &&
 *  messageListProps.messages.some(m => m.role === 'assistant') && (
 *   <ChatToolbar
 *     onShare={openShareModal}
 *     messages={messageListProps.messages}
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
 *
 * // ❌ Text labels with icons (old design)
 * <span>Copy</span> // NO TEXT LABELS!
 * ```
 *
 * REGRESSION PREVENTION:
 * If E2E tests fail, DO NOT remove the message checks!
 * Instead, ensure tests wait for messages before expecting toolbar.
 */

import React from "react";
import { copyToClipboard } from "../lib/clipboard";
import { formatConversationMarkdown } from "../lib/utils";
import type { Message } from "../lib/types/message";
import { toast } from "sonner";

interface ChatToolbarProps {
  /** Handler to open share modal - required for share functionality */
  onShare?: () => void;
  /** Handler to create a new chat - same as sidebar New Chat button */
  onNewChat?: () => void;
  /** Messages to copy - MUST contain at least one message */
  messages?: Message[];
  /** Chat title for formatting the copied content */
  chatTitle?: string;
}

/**
 * Icon-only toolbar with New Chat, Copy, and Share buttons for chat conversations.
 *
 * DESIGN NOTES:
 * - Icon-only buttons following CopyButton component pattern
 * - Subtle presence with transparent background
 * - Minimal height to avoid layout disruption
 * - Right-aligned actions matching MessageInput send button position
 *
 * ⚠️ CRITICAL: Parent component MUST ensure:
 * 1. currentChatId exists (Convex chat, not local)
 * 2. messages.length > 0
 * 3. At least one assistant message exists
 *
 * @param onShare - Handler to open share modal
 * @param onNewChat - Handler to create new chat (same as sidebar button)
 * @param messages - Messages to copy (must not be empty)
 * @param chatTitle - Title for formatted output
 */
export function ChatToolbar({
  onShare,
  onNewChat,
  messages = [],
  chatTitle,
}: ChatToolbarProps) {
  const [copying, setCopying] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const copyTimeoutRef = React.useRef<NodeJS.Timeout | null>(null);

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
        setCopied(true);
        toast.success("Conversation copied to clipboard");

        // Clear any existing timeout
        if (copyTimeoutRef.current) {
          clearTimeout(copyTimeoutRef.current);
        }

        // Reset copied state after 2 seconds
        copyTimeoutRef.current = setTimeout(() => {
          setCopied(false);
          copyTimeoutRef.current = null;
        }, 2000);
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
    <div className="flex items-center justify-end gap-3 px-3 sm:px-4 py-2">
      {/* Icon-only New Chat Button */}
      <button
        type="button"
        onClick={onNewChat}
        className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-lg transition-all duration-200"
        aria-label="Start new chat"
        title="New chat"
      >
        <svg
          className="w-5 h-5"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 4v16m8-8H4"
          />
        </svg>
      </button>

      {/* Icon-only Copy All Messages Button */}
      <button
        type="button"
        onClick={handleCopyAll}
        disabled={copying || messages.length === 0}
        className={`p-2 rounded-lg transition-all duration-200 ${
          copied
            ? "text-emerald-500 dark:text-emerald-400 hover:text-emerald-600 dark:hover:text-emerald-300"
            : "text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300"
        } disabled:opacity-50 disabled:cursor-not-allowed`}
        aria-label={copied ? "Copied to clipboard" : "Copy entire conversation"}
        title={copied ? "Copied!" : "Copy entire conversation"}
      >
        {copied ? (
          // Checkmark icon for success feedback
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M5 13l4 4L19 7"
            />
          </svg>
        ) : (
          // Copy icon
          <svg
            className="w-5 h-5"
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
        )}
      </button>

      {/* Icon-only Share Button */}
      <button
        type="button"
        onClick={onShare}
        className="p-2 text-gray-400 hover:text-gray-600 dark:text-gray-500 dark:hover:text-gray-300 rounded-lg transition-all duration-200"
        aria-label="Share chat"
        title="Share conversation"
      >
        <svg
          className="w-5 h-5"
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
      </button>
    </div>
  );
}
