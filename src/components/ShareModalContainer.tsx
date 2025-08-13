// ShareModalContainer - wrapper for ShareModal with additional logic
import { ShareModal } from "./ShareModal";

interface ShareModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  currentChat: unknown;
  allChats: unknown[];
  isAuthenticated: boolean;
  chatState: unknown;
  chatActions: unknown;
  updateChatPrivacy: unknown;
  navigateWithVerification: unknown;
  buildChatPath: unknown;
  fetchJsonWithRetry: unknown;
  resolveApi: unknown;
}

export function ShareModalContainer(props: ShareModalContainerProps) {
  // For now, just pass through to ShareModal
  return (
    <ShareModal
      isOpen={props.isOpen}
      onClose={props.onClose}
      chatId={props.currentChatId}
    />
  );
}
