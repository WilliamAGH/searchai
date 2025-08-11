/**
 * Reusable copy button component with feedback
 */

import React, { useState, useRef } from "react";
import { copyToClipboard } from "../lib/clipboard";
import clsx from "clsx";
import { toast } from "sonner";

interface CopyButtonProps {
  /** Text to copy to clipboard */
  text: string;
  /** Optional callback after successful copy */
  onCopy?: () => void;
  /** Button size variant */
  size?: "sm" | "md";
  /** Additional CSS classes */
  className?: string;
  /** Accessible label */
  ariaLabel?: string;
  /** Tooltip title */
  title?: string;
}

/**
 * Copy button with visual feedback
 * @param text - Text to copy to clipboard
 * @param onCopy - Optional success callback
 * @param size - Button size (sm or md)
 * @param className - Additional CSS classes
 * @param ariaLabel - Accessible label
 * @param title - Tooltip text
 */
export function CopyButton({
  text,
  onCopy,
  size = "sm",
  className = "",
  ariaLabel = "Copy to clipboard",
  title = "Copy",
}: CopyButtonProps) {
  const [copied, setCopied] = useState(false);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * Handle copy action with feedback
   */
  const handleCopy = React.useCallback(
    async (e: React.MouseEvent) => {
      e.stopPropagation();
      e.preventDefault();

      const success = await copyToClipboard(text);

      if (success) {
        setCopied(true);
        onCopy?.();

        // Clear any existing timeout
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        // Reset after 2 seconds
        timeoutRef.current = setTimeout(() => {
          setCopied(false);
          timeoutRef.current = null;
        }, 2000);
      } else {
        toast.error("Failed to copy to clipboard");
      }
    },
    [text, onCopy],
  );

  const iconSize = size === "sm" ? "w-4 h-4" : "w-5 h-5";

  return (
    <button
      type="button"
      onClick={handleCopy}
      className={clsx(
        "p-0 transition-all duration-200",
        copied
          ? "text-emerald-500 dark:text-emerald-400"
          : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300",
        className,
      )}
      title={copied ? "Copied!" : title}
      aria-label={copied ? "Copied to clipboard" : ariaLabel}
    >
      {copied ? (
        // Checkmark icon for success feedback
        <svg
          className={iconSize}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
          className={iconSize}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
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
  );
}
