// ChatControls - minimal implementation for chat controls
interface ChatControlsProps {
  onNewChat?: () => void;
  onShare?: () => void;
  isGenerating?: boolean;
}

export function ChatControls(props: ChatControlsProps) {
  // Minimal implementation - controls are handled elsewhere
  return null;
}
