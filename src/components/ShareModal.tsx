/**
 * Share modal for chat conversations
 * - Public/private sharing toggle
 * - Copy link functionality
 * - Visual share status indicator
 * - Mobile-responsive design
 */

import React, { useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";
import { copyToClipboard } from "@/lib/clipboard";
import { formatConversationMarkdown } from "@/lib/utils";
import type { PrivacyOption, ShareModalMessage } from "@/components/share/shareModalTypes";
import { buildShareUrl, toPersistedPrivacy } from "@/components/share/shareModalUtils";
import { ShareModalContent } from "@/components/share/ShareModalContent";

interface ShareModalProps {
  isOpen: boolean;
  onClose: () => void;
  onShare: (
    privacy: "private" | "shared" | "public",
  ) => Promise<{ shareId?: string; publicId?: string } | void>;
  privacy: "private" | "shared" | "public";
  /** Optional machine-readable Markdown .txt URL */
  llmTxtUrl?: string;
  /** IDs for building LLM/export URLs when toggling */
  shareId?: string;
  publicId?: string;
  /** Base URL for export endpoint, e.g., https://*.convex.site/api/exportChat */
  exportBase?: string;
  /** Optional chat messages for markdown export */
  messages?: ShareModalMessage[];
}

export function ShareModal({
  isOpen,
  onClose,
  onShare,
  privacy,
  llmTxtUrl,
  shareId,
  publicId,
  exportBase,
  messages,
}: ShareModalProps) {
  const [selectedPrivacy, setSelectedPrivacy] = useState<"private" | "shared" | "public" | "llm">(
    privacy,
  );
  const [urlCopied, setUrlCopied] = useState(false);
  const [markdownCopied, setMarkdownCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const [generatedUrl, setGeneratedUrl] = useState<string>("");
  const [generatedFor, setGeneratedFor] = useState<"private" | "shared" | "public" | "llm" | null>(
    null,
  );
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
    const effective = toPersistedPrivacy(selectedPrivacy);
    await onShare(effective);
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
    // Check if already generated for the current selection
    // Note: "llm" and "shared" both use the same shareId, so they're interchangeable
    const isAlreadyGenerated =
      displayUrl &&
      (generatedFor === selectedPrivacy ||
        (generatedFor === "llm" && selectedPrivacy === "shared") ||
        (generatedFor === "shared" && selectedPrivacy === "llm"));

    if (isAlreadyGenerated) {
      try {
        const ok = await copyToClipboard(displayUrl);
        if (ok) {
          setUrlCopied(true);
          if (copyTimeoutRef.current !== null) clearTimeout(copyTimeoutRef.current);
          copyTimeoutRef.current = setTimeout(() => setUrlCopied(false), 2000);
        }
      } catch (error) {
        logger.error("Failed to copy URL", { error });
      }
      return;
    }

    setBusy(true);
    try {
      const effective = toPersistedPrivacy(selectedPrivacy);
      const response = await onShare(effective);

      // Merge server response with existing prop IDs (server takes precedence)
      const ids = {
        shareId: response?.shareId || shareId,
        publicId: response?.publicId || publicId,
      };

      const newUrl = buildShareUrl(selectedPrivacy, ids, exportBase, llmTxtUrl);

      if (newUrl) {
        setGeneratedUrl(newUrl);
        setGeneratedFor(selectedPrivacy === "private" ? null : selectedPrivacy);
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
    publicId,
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

  const handleSelectPrivacy = React.useCallback(
    (value: PrivacyOption) => setSelectedPrivacy(value),
    [],
  );

  const handleCopyMarkdown = React.useCallback(async () => {
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
  }, [markdownContent]);

  if (!isOpen) return null;

  return (
    <ShareModalContent
      selectedPrivacy={selectedPrivacy}
      displayUrl={displayUrl}
      busy={busy}
      urlCopied={urlCopied}
      markdownCopied={markdownCopied}
      markdownContent={markdownContent}
      showMarkdown={Boolean(messages && messages.length > 0)}
      closeBtnRef={closeBtnRef}
      onSelectPrivacy={handleSelectPrivacy}
      onGenerateOrCopy={handleGenerateOrCopy}
      onCopyMarkdown={handleCopyMarkdown}
      onClose={onClose}
      onDialogKeyDown={handleDialogKeyDown}
      onOverlayKeyDown={handleOverlayKeyDown}
      onOverlayClick={handleOverlayClick}
    />
  );
}
