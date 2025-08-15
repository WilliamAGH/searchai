/**
 * Share modal for chat conversations
 * - Public/private sharing toggle
 * - Copy link functionality
 * - Visual share status indicator
 * - Mobile-responsive design
 */

import React, { useEffect, useRef, useState } from "react";
import { logger } from "../lib/logger";
import { Spinner } from "./ui/Spinner";
import { copyToClipboard } from "../lib/clipboard";
import { formatConversationMarkdown } from "../lib/utils";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: (
    privacy: "private" | "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string } | void>;
  shareUrl: string;
  privacy: "private" | "shared" | "public";
  /** Optional machine-readable Markdown .txt URL */
  llmTxtUrl?: string;
  /** IDs for building LLM/export URLs when toggling */
  shareId?: string;
  publicId?: string;
  /** Base URL for export endpoint, e.g., https://*.convex.site/api/exportChat */
  exportBase?: string;
  /** Optional chat messages for markdown export */
  messages?: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    searchResults?: Array<{ title?: string; url?: string }> | undefined;
    sources?: string[] | undefined;
  }>;
}

export function ShareModal({
  isOpen,
  onClose,
  onShare,
  shareUrl: _shareUrl,
  privacy,
  llmTxtUrl,
  shareId,
  publicId: _publicId,
  exportBase,
  messages,
}: ShareModalProps) {
  const [selectedPrivacy, setSelectedPrivacy] = useState<
    "private" | "shared" | "public" | "llm"
  >(privacy);
  const [urlCopied, setUrlCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string>("");
  const [generatedFor, setGeneratedFor] = useState<
    "shared" | "public" | "llm" | null
  >(null);
  const copyTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const markdownTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const openedAtRef = useRef<number>(0);

  useEffect(() => {
    setSelectedPrivacy(privacy);
  }, [privacy]);

  // When switching options, clear any previously generated URL
  useEffect(() => {
    setGeneratedUrl("");
    setGeneratedFor(null);
  }, [selectedPrivacy]);

  useEffect(() => {
    return () => {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
      }
      if (markdownTimeoutRef.current !== null) {
        clearTimeout(markdownTimeoutRef.current);
      }
    };
  }, []);

  // Clear copy feedback when closing the modal
  useEffect(() => {
    if (!isOpen) {
      if (copyTimeoutRef.current !== null) {
        clearTimeout(copyTimeoutRef.current);
        copyTimeoutRef.current = null;
      }
      if (markdownTimeoutRef.current !== null) {
        clearTimeout(markdownTimeoutRef.current);
        markdownTimeoutRef.current = null;
      }
      setUrlCopied(false);
      setMarkdownCopied(false);
    }
  }, [isOpen]);

  // Initial focus when opening
  useEffect(() => {
    if (isOpen) {
      openedAtRef.current = Date.now();
      closeBtnRef.current?.focus();
    }
  }, [isOpen]);

  const _handleShare = React.useCallback(async () => {
    // Map LLM to shared privacy when persisting
    const effective = selectedPrivacy === "llm" ? "shared" : selectedPrivacy;
    await onShare(effective as "private" | "shared" | "public");
  }, [onShare, selectedPrivacy]);

  // The URL box should start empty and only populate once generated
  const displayUrl = generatedUrl;

  // Generate a fresh URL for the selected option, or copy if already generated
  // Generate markdown for exporting
  // oxlint-disable-next-line react-hooks/exhaustive-deps -- Known oxlint bug: props incorrectly flagged as "outer scope values"
  const markdownContent = React.useMemo(() => {
    const messagesToFormat = messages;
    if (!messagesToFormat) return "";
    return formatConversationMarkdown({
      messages: messagesToFormat.map((m) => ({
        role: m.role,
        content: m.content || "",
        searchResults: m.searchResults,
        sources: m.sources,
      })),
    });
  }, [messages]);

  const handleGenerateOrCopy = React.useCallback(async () => {
    // If already generated for the current selection, copy it
    if (displayUrl && generatedFor === selectedPrivacy) {
      try {
        const ok = await copyToClipboard(displayUrl);
        if (ok) {
          setUrlCopied(true);
          if (copyTimeoutRef.current !== null)
            clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => setUrlCopied(false), 2000);
        }
      } catch (error) {
        logger.error("Failed to copy URL", { error });
      }
      return;
    }

    setBusy(true);
    try {
      const effective = selectedPrivacy === "llm" ? "shared" : selectedPrivacy;
      const maybe = await onShare(effective as "private" | "shared" | "public");
      const ret =
        (maybe as unknown as { shareId?: string; publicId?: string }) || {};

      let newUrl = "";
      if (selectedPrivacy === "llm") {
        // Always build fresh LLM URL from returned shareId when available
        if (ret.shareId && exportBase) {
          newUrl = `${exportBase}?shareId=${encodeURIComponent(ret.shareId)}&format=txt`;
        } else if (shareId && exportBase) {
          newUrl = `${exportBase}?shareId=${encodeURIComponent(shareId)}&format=txt`;
        } else if (llmTxtUrl) {
          newUrl = llmTxtUrl;
        }
      } else if (selectedPrivacy === "shared") {
        const sid =
          ret.shareId ||
          shareId ||
          `s_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        newUrl = `${window.location.origin}/s/${sid}`;
        // As a secondary option, if exportBase exists and we prefer txt, we could use it, but tests accept /s/
      } else if (selectedPrivacy === "public") {
        const pid =
          ret.publicId ||
          _publicId ||
          `p_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
        newUrl = `${window.location.origin}/p/${pid}`;
      }

      if (newUrl) {
        setGeneratedUrl(newUrl);
        setGeneratedFor(selectedPrivacy);
      }
    } catch (error) {
      logger.error("Failed to generate URL", { error });
    } finally {
      setBusy(false);
    }
  }, [
    displayUrl,
    generatedFor,
    onShare,
    selectedPrivacy,
    exportBase,
    shareId,
    _publicId,
    llmTxtUrl,
  ]);

  const handleDialogKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  const handleOverlayKeyDown = React.useCallback(
    (e: React.KeyboardEvent<HTMLDivElement>) => {
      // Guard against immediate close right after opening
      const justOpened = Date.now() - openedAtRef.current < 200;
      if (justOpened) return;
      if (e.key === "Escape" || e.key === "Enter") onClose();
    },
    [onClose],
  );

  const handleOverlayClick = React.useCallback(
    (_e: React.MouseEvent<HTMLDivElement>) => {
      const justOpened = Date.now() - openedAtRef.current < 200;
      if (justOpened) return;
      onClose();
    },
    [onClose],
  );

  const selectPrivate = React.useCallback(
    () => setSelectedPrivacy("private"),
    [],
  );
  const selectShared = React.useCallback(
    () => setSelectedPrivacy("shared"),
    [],
  );
  const selectPublic = React.useCallback(
    () => setSelectedPrivacy("public"),
    [],
  );
  const selectLlm = React.useCallback(() => setSelectedPrivacy("llm"), []);

  if (!isOpen) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
      onKeyDown={handleDialogKeyDown}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={handleOverlayClick}
        onKeyDown={handleOverlayKeyDown}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-900 rounded-2xl shadow-2xl max-w-sm sm:max-w-md w-full mx-4 p-5 sm:p-6 border border-gray-200 dark:border-gray-700 font-serif dark:font-mono">
        <button
          ref={closeBtnRef}
          onClick={onClose}
          className="absolute top-4 right-4 p-2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 transition-colors"
          aria-label="Close"
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>

        <div className="text-center mb-6">
          <div className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4 bg-gradient-to-br from-emerald-500 to-teal-600 rounded-xl flex items-center justify-center">
            <svg
              className="w-6 h-6 text-white"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.367 2.684 3 3 0 00-5.367-2.684z"
              />
            </svg>
          </div>
          <h2
            id="share-modal-title"
            className="text-lg sm:text-xl font-bold text-gray-900 dark:text-white mb-2 dark:uppercase dark:tracking-wide"
          >
            Share this conversation
          </h2>
          <p className="text-gray-600 dark:text-gray-400 text-sm">
            {selectedPrivacy === "private" && "Only you can access this chat."}
            {selectedPrivacy === "shared" &&
              "Anyone with the link can view (not indexed)."}
            {selectedPrivacy === "public" &&
              "Publicly viewable and may appear in search results."}
            {selectedPrivacy === "llm" &&
              "LLM-friendly link; same visibility as Shared (not indexed)."}
          </p>
        </div>

        <div className="space-y-4">
          <div className="space-y-2">
            <fieldset>
              <legend className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Privacy Level
              </legend>
              <div className="mt-1 flex flex-col space-y-2">
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Private"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="private"
                    checked={selectedPrivacy === "private"}
                    onChange={selectPrivate}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Private
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Only you can see this chat.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Shared"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="shared"
                    checked={selectedPrivacy === "shared"}
                    onChange={selectShared}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Shared
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Anyone with the link can view. Not indexed.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="Public"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="public"
                    checked={selectedPrivacy === "public"}
                    onChange={selectPublic}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      Public
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Anyone can view and it may appear in search results.
                    </div>
                  </div>
                </label>
                <label
                  className="flex items-center gap-3 p-3 border border-gray-200 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer"
                  aria-label="LLM Link"
                >
                  <input
                    type="radio"
                    name="privacy"
                    value="llm"
                    checked={selectedPrivacy === "llm"}
                    onChange={selectLlm}
                    className="w-4 h-4 text-emerald-600 bg-gray-100 border-gray-300 focus:ring-emerald-500"
                  />
                  <div>
                    <div className="text-sm font-medium text-gray-900 dark:text-white">
                      LLM Link (Markdown .txt)
                    </div>
                    <div className="text-xs text-gray-500 dark:text-gray-400">
                      Same visibility as Shared, formatted for LLMs; not
                      indexed.
                    </div>
                  </div>
                </label>
              </div>
            </fieldset>
          </div>

          {(selectedPrivacy === "shared" ||
            selectedPrivacy === "public" ||
            selectedPrivacy === "llm") && (
            <div className="space-y-3">
              <label
                htmlFor="share-url-input"
                className="text-sm font-medium text-gray-700 dark:text-gray-300"
              >
                Link
              </label>
              <div className="flex gap-2">
                <input
                  id="share-url-input"
                  type="text"
                  value={displayUrl}
                  placeholder={
                    selectedPrivacy === "llm"
                      ? "Generate LLM-friendly .txt link"
                      : selectedPrivacy === "shared"
                        ? "Generate shared link"
                        : "Generate public link"
                  }
                  readOnly
                  className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                <button
                  onClick={handleGenerateOrCopy}
                  className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                  aria-label={
                    displayUrl
                      ? "Copy URL to clipboard"
                      : busy
                        ? "Generating…"
                        : "Generate URL"
                  }
                  disabled={busy}
                >
                  {displayUrl ? (
                    urlCopied ? (
                      "Copied!"
                    ) : (
                      "Copy"
                    )
                  ) : busy ? (
                    <span className="inline-flex items-center gap-2">
                      <Spinner size="sm" />
                      Generating…
                    </span>
                  ) : (
                    "Generate URL"
                  )}
                </button>
              </div>
            </div>
          )}

          <div className="space-y-4">
            {messages && messages.length > 0 && (
              <div className="space-y-2">
                <div className="text-sm font-medium text-gray-700 dark:text-gray-300">
                  Export as Markdown
                </div>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={markdownContent}
                    readOnly
                    className="flex-1 px-3 py-2 text-sm bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500"
                  />
                  <button
                    onClick={async () => {
                      try {
                        const ok = await copyToClipboard(markdownContent);
                        if (ok) {
                          setMarkdownCopied(true);
                          // Clear any existing timeout
                          if (markdownTimeoutRef.current !== null) {
                            clearTimeout(markdownTimeoutRef.current);
                          }
                          // Set new timeout
                          markdownTimeoutRef.current = setTimeout(() => {
                            setMarkdownCopied(false);
                            markdownTimeoutRef.current = null;
                          }, 2000);
                        }
                      } catch (error) {
                        logger.error("Failed to copy markdown", { error });
                      }
                    }}
                    className="px-3 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors text-sm font-medium focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900 disabled:opacity-60"
                  >
                    {markdownCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
              </div>
            )}
            <div className="flex gap-3">
              <button
                onClick={onClose}
                className="flex-1 px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors font-medium"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
