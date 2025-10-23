// ShareModalContainer - wrapper for ShareModal with additional logic
/**
 * ShareModalContainer
 *
 * Lightweight wrapper around ShareModal that adapts current chat state
 * to the ShareModal API (privacy, share/public IDs, and export URL).
 *
 * Notes
 * - Intentionally keeps props minimal to avoid leaking unrelated UI state.
 * - Uses optional `chatActions.shareChat` to persist/upgrade sharing mode.
 * - Computes `exportBase` via optional `resolveApi` helper or window.origin.
 */
import { useMemo } from "react";
import { ShareModal } from "./ShareModal";

type ChatPrivacy = "private" | "shared" | "public";

/**
 * Contract for share-related actions used by ShareModalContainer.
 * If provided, `shareChat` should persist a new privacy state and return
 * any newly-created identifiers for shared or public links.
 */
interface ShareChatActions {
  shareChat?: (
    id: string,
    privacy: Exclude<ChatPrivacy, "private">,
  ) => Promise<{ shareId?: string; publicId?: string }>;
}

/**
 * Minimal prop surface needed by ShareModalContainer.
 * - `currentChat` supplies existing privacy and IDs (if any).
 * - `chatActions` provides an optional `shareChat` action to persist changes.
 * - `resolveApi` maps a relative API path to an absolute URL for export.
 */
interface ShareModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  currentChat: {
    privacy?: ChatPrivacy;
    shareId?: string;
    publicId?: string;
    messages?: Array<{
      role: "user" | "assistant" | "system";
      content?: string;
      searchResults?: Array<{ title?: string; url?: string }> | undefined;
      sources?: string[] | undefined;
    }>;
  } | null;
  chatActions?: ShareChatActions;
  resolveApi?: (path: string) => string;
}

export function ShareModalContainer(props: ShareModalContainerProps) {
  const { resolveApi } = props;
  const privacy = props.currentChat?.privacy || "private";
  const shareId = props.currentChat?.shareId || undefined;
  const publicId = props.currentChat?.publicId || undefined;

  const exportBase = useMemo(() => {
    if (typeof resolveApi === "function") {
      try {
        return resolveApi("/api/chatTextMarkdown");
      } catch (error) {
        // Fall back to default if resolveApi fails
        console.error("Failed to resolve API path", error);
      }
    }
    return `${window.location.origin}/api/chatTextMarkdown`;
  }, [resolveApi]);

  const shareUrl = useMemo(() => {
    if (privacy === "shared" && shareId)
      return `${window.location.origin}/s/${shareId}`;
    if (privacy === "public" && publicId)
      return `${window.location.origin}/p/${publicId}`;
    return "";
  }, [privacy, shareId, publicId]);

  const onShare = async (
    p: ChatPrivacy,
  ): Promise<{ shareId?: string; publicId?: string } | void> => {
    if (!props.currentChatId) return;
    if (p === "private") return;
    if (props.chatActions?.shareChat) {
      const result = await props.chatActions.shareChat(
        props.currentChatId,
        p === "shared" ? "shared" : "public",
      );
      return result;
    }
    return { shareId, publicId };
  };

  return (
    <ShareModal
      isOpen={props.isOpen}
      onClose={props.onClose}
      onShare={onShare}
      shareUrl={shareUrl}
      privacy={privacy as ChatPrivacy}
      llmTxtUrl={
        shareId
          ? `${exportBase}?shareId=${encodeURIComponent(shareId)}`
          : undefined
      }
      shareId={shareId}
      publicId={publicId}
      exportBase={exportBase}
      messages={props.currentChat?.messages}
    />
  );
}
