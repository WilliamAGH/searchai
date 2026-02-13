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
 * - Export URLs use the branded origin (window.location.origin) so that
 *   shared links point to researchly.bot, not the raw Convex deployment.
 *   The production server and Vite dev proxy both forward /api/* to Convex.
 */
import { ShareModal } from "@/components/ShareModal";
import type { WebResearchSourceClient } from "@/lib/schemas/messageStream";

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
      webResearchSources?: WebResearchSourceClient[];
    }>;
  } | null;
  chatActions?: ShareChatActions;
}

export function ShareModalContainer(props: Readonly<ShareModalContainerProps>) {
  const privacy = props.currentChat?.privacy || "private";
  const shareId = props.currentChat?.shareId || undefined;
  const publicId = props.currentChat?.publicId || undefined;

  // Use branded origin so export URLs point to researchly.bot, not the raw
  // Convex deployment. The /api/* proxy (server.mjs + Vite dev) forwards
  // requests to the Convex HTTP layer transparently.
  const origin = typeof window !== "undefined" ? window.location.origin : "";
  const exportBase = `${origin}/api/chatTextMarkdown`;

  const onShare = async (
    privacy: ChatPrivacy,
  ): Promise<{ shareId?: string; publicId?: string } | void> => {
    if (!props.currentChatId) return;
    if (privacy === "private") return;
    if (props.chatActions?.shareChat) {
      const result = await props.chatActions.shareChat(
        props.currentChatId,
        privacy,
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
      privacy={privacy}
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
