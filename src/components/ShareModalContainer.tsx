// ShareModalContainer - wrapper for ShareModal with additional logic
import { ShareModal } from "./ShareModal";

interface ShareModalContainerProps {
  isOpen: boolean;
  onClose: () => void;
  currentChatId: string | null;
  currentChat: any;
  allChats: any[];
  isAuthenticated: boolean;
  chatState: any;
  chatActions: any;
  updateChatPrivacy: any;
  navigateWithVerification: any;
  buildChatPath: any;
  fetchJsonWithRetry: any;
  resolveApi: any;
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
