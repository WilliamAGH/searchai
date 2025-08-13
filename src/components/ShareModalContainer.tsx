// ShareModalContainer - wrapper for ShareModal with additional logic
import { useMemo } from "react";
import { ShareModal } from "./ShareModal";

interface ShareModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  currentChat: {
    privacy?: "private" | "shared" | "public";
    shareId?: string;
    publicId?: string;
  } | null;
  allChats: unknown[];
  isAuthenticated: boolean;
  chatState: unknown;
  chatActions: unknown;
  updateChatPrivacy: unknown;
  navigateWithVerification: unknown;
  buildChatPath?: unknown;
  fetchJsonWithRetry?: unknown;
  resolveApi?: unknown;
}

export function ShareModalContainer(props: ShareModalContainerProps) {
  const privacy = props.currentChat?.privacy || "private";
  const shareId = props.currentChat?.shareId || undefined;
  const publicId = props.currentChat?.publicId || undefined;

  const exportBase = useMemo(() => {
    if (typeof props.resolveApi === "function") {
      try {
        return (props.resolveApi as (p: string) => string)(
          "/api/chatTextMarkdown",
        );
      } catch {}
    }
    return `${window.location.origin}/api/chatTextMarkdown`;
  }, [props.resolveApi]);

  const shareUrl = useMemo(() => {
    if (privacy === "shared" && shareId)
      return `${window.location.origin}/s/${shareId}`;
    if (privacy === "public" && publicId)
      return `${window.location.origin}/p/${publicId}`;
    return "";
  }, [privacy, shareId, publicId]);

  const onShare = async (
    p: "private" | "shared" | "public",
  ): Promise<{ shareId?: string; publicId?: string } | void> => {
    const anyActions = props.chatActions as unknown as {
      shareChat?: (
        id: string,
        privacy: "shared" | "public",
      ) => Promise<{ shareId?: string; publicId?: string }>;
    };
    if (!props.currentChatId) return;
    if (p === "private") return;
    if (anyActions && typeof anyActions.shareChat === "function") {
      const result = await anyActions.shareChat(
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
      privacy={privacy as "private" | "shared" | "public"}
      llmTxtUrl={
        shareId
          ? `${exportBase}?shareId=${encodeURIComponent(shareId)}`
          : undefined
      }
      shareId={shareId}
      publicId={publicId}
      exportBase={exportBase}
    />
  );
}
