// ChatControls - minimal implementation for chat controls
interface ChatControlsProps {
  onNewChat?: () => void;
  onShare?: () => void;
  isGenerating?: boolean;
}

export function ChatControls(_props: ChatControlsProps) {
  // Minimal implementation - controls are handled elsewhere
  return null;
}
