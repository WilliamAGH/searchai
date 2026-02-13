/**
 * Message input textarea component
 * - Auto-resizing textarea up to 200px
 * - Enter to send, Shift+Enter for newline
 * - Mobile-optimized with proper font sizing
 * - Disabled state during generation
 * - Image attachments via paste or file picker
 */

import React, { useState, useRef } from "react";
import { useAutoResizeTextarea } from "@/hooks/useAutoResizeTextarea";
import { useMessageInputFocus } from "@/hooks/useMessageInputFocus";
import { useInputHistory } from "@/hooks/useInputHistory";
import { ImageAttachmentPreview } from "@/components/ImageAttachmentPreview";
import { MessageInputActions } from "@/components/MessageInputActions";
import type { ImageUploadState } from "@/hooks/useImageUpload";

const TEXTAREA_CLASSES = [
  // layout
  "w-full pl-3 sm:pl-4 pr-36 resize-none overflow-y-auto overflow-x-hidden",
  // typography
  "text-base tracking-tight font-ui slashed-zero lining-nums tabular-nums",
  "break-words whitespace-pre-wrap",
  // shape & border
  "rounded-2xl border border-gray-200/80 dark:border-gray-700/60 outline-none",
  // color
  "bg-white dark:bg-gray-800 text-gray-900 dark:text-gray-100",
  "placeholder-gray-400 dark:placeholder-gray-500",
  // shadow
  "shadow-sm shadow-gray-200/50 dark:shadow-black/20",
  // focus
  "focus:border-emerald-500 dark:focus:border-emerald-400",
  "focus:ring-1 focus:ring-emerald-500/30 dark:focus:ring-emerald-400/30",
  "focus:shadow-md focus:shadow-emerald-500/5 dark:focus:shadow-emerald-400/5",
  // transition
  "transition-all duration-200",
  // hooks for JS/CSS selectors
  "message-input-textarea message-textarea",
].join(" ");

interface MessageInputProps {
  /** Callback when message is sent (with optional image storage IDs) */
  onSendMessage: (
    message: string,
    imageStorageIds?: string[],
  ) => void | Promise<void>;
  /** Open share modal */
  onShare?: () => void;
  /** Start a new chat */
  onNewChat?: () => void;
  /** Disable input during generation */
  disabled?: boolean;
  /** Placeholder text */
  placeholder?: string;
  /** Optional draft-change callback (debounced in parent) */
  onDraftChange?: (draft: string) => void;
  /** Optional history of previous user messages (oldest -> newest) */
  history?: Array<string>;
  /** Image upload state from useImageUpload hook */
  imageUpload?: ImageUploadState;
}

/**
 * Message input with auto-resize and keyboard shortcuts
 * @param onSendMessage - Handler for message submission
 * @param disabled - Prevent input when true
 * @param placeholder - Input placeholder text
 */
export function MessageInput({
  onSendMessage,
  onShare,
  onNewChat,
  disabled = false,
  placeholder = "Ask me anything...",
  onDraftChange,
  history = [],
  imageUpload,
}: MessageInputProps) {
  const MAX_TEXTAREA_HEIGHT = 200;
  const [message, setMessage] = useState("");
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const { historyIndex, handleHistoryNavigation, resetHistory } =
    useInputHistory({
      history,
      currentMessage: message,
      setMessage,
      onDraftChange,
      textareaRef,
    });

  /** Upload pending images, send message, then clear input. */
  const sendCurrentMessage = React.useCallback(async () => {
    const trimmed = message.trim();
    if (
      (!trimmed && !imageUpload?.hasImages) ||
      disabled ||
      imageUpload?.isUploading
    )
      return;
    const storageIds = imageUpload?.hasImages
      ? await imageUpload.uploadAll()
      : undefined;
    await onSendMessage(trimmed, storageIds);
    setMessage("");
    onDraftChange?.("");
    resetHistory();
    imageUpload?.clear();
  }, [
    message,
    disabled,
    onSendMessage,
    onDraftChange,
    resetHistory,
    imageUpload,
  ]);

  const handleSubmit = React.useCallback(
    (e: React.FormEvent<HTMLFormElement>) => {
      e.preventDefault();
      void sendCurrentMessage();
    },
    [sendCurrentMessage],
  );

  /** Enter to send, Shift+Enter for newline, ArrowUp/Down for history. */
  const handleKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      const isComposing = e.nativeEvent.isComposing ?? false;
      if (isComposing) return; // avoid sending mid-IME composition
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        void sendCurrentMessage();
        return;
      }

      // Ignore modifier combos for history navigation
      if (e.altKey || e.ctrlKey || e.metaKey) return;

      // Delegate history navigation to the hook
      const ta = textareaRef.current;
      if (!ta) return;
      const atStart = ta.selectionStart === 0 && ta.selectionEnd === 0;
      const atEnd =
        ta.selectionStart === message.length &&
        ta.selectionEnd === message.length;

      if (handleHistoryNavigation(e.key, atStart, atEnd)) {
        e.preventDefault();
      }
    },
    [sendCurrentMessage, message, handleHistoryNavigation],
  );

  /** Intercept paste events to capture image data from clipboard. */
  const handlePaste = React.useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      if (!imageUpload) return;
      const files = Array.from(e.clipboardData.files).filter((f) =>
        f.type.startsWith("image/"),
      );
      if (files.length > 0) {
        e.preventDefault();
        imageUpload.addImages(files);
      }
    },
    [imageUpload],
  );

  const handleFileSelect = React.useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (!imageUpload || !e.target.files) return;
      imageUpload.addImages(Array.from(e.target.files));
      e.target.value = "";
    },
    [imageUpload],
  );

  useAutoResizeTextarea({
    textareaRef,
    maxHeight: MAX_TEXTAREA_HEIGHT,
    dependencies: [message, placeholder, disabled],
  });
  useMessageInputFocus({ textareaRef, disabled });

  const handleChange = React.useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const val = e.target.value;
      setMessage(val);
      if (historyIndex !== null) {
        resetHistory();
      }
      onDraftChange?.(val);
    },
    [historyIndex, onDraftChange, resetHistory],
  );

  const hasPendingContent = message.trim() || imageUpload?.hasImages;

  return (
    <div>
      {/* Image attachment preview strip */}
      {imageUpload &&
        (imageUpload.hasImages || imageUpload.rejections.length > 0) && (
          <ImageAttachmentPreview
            images={imageUpload.images}
            onRemove={imageUpload.removeImage}
            isUploading={imageUpload.isUploading}
            rejections={imageUpload.rejections}
            onDismissRejection={imageUpload.dismissRejection}
          />
        )}
      <div className="px-3 sm:px-4 pb-3 sm:pb-4 pt-1">
        <form onSubmit={handleSubmit}>
          <div className="relative flex items-center">
            <textarea
              id="message-input"
              name="message"
              ref={textareaRef}
              value={message}
              onChange={handleChange}
              onKeyDown={handleKeyDown}
              onPaste={handlePaste}
              placeholder={placeholder}
              aria-label="Message input"
              data-testid="message-input"
              disabled={disabled}
              rows={1}
              autoComplete="off"
              className={`${TEXTAREA_CLASSES} ${message ? "pt-3 pb-3" : "pt-[0.625rem] pb-[0.875rem]"}`}
            />
            {/* Hidden file input for image picker */}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/png,image/jpeg,image/gif,image/webp"
              multiple
              onChange={handleFileSelect}
              className="hidden"
              tabIndex={-1}
            />
            <MessageInputActions
              onAttach={
                imageUpload ? () => fileInputRef.current?.click() : undefined
              }
              onNewChat={onNewChat}
              onShare={onShare}
              message={message}
              disabled={disabled}
              hasImageUpload={!!imageUpload}
            />
            <button
              type="submit"
              aria-label="Send message"
              title="Send message"
              disabled={!hasPendingContent || disabled}
              className="absolute right-2 top-1/2 transform -translate-y-1/2 w-8 h-8 sm:w-7 sm:h-7 bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 dark:disabled:bg-gray-600 disabled:cursor-not-allowed rounded-lg flex items-center justify-center transition-colors"
            >
              <svg
                className="w-4 h-4 sm:w-3.5 sm:h-3.5 text-white"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8"
                />
              </svg>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
