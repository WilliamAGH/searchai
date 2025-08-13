/**
 * Chat State Management Hook
 * Manages the state for chat operations
 */

import { useState } from "react";
import type { UnifiedChat, UnifiedMessage } from "../lib/types/unified";
import { DEFAULT_FEATURE_FLAGS } from "../lib/types/unified";

export interface ChatState {
  chats: UnifiedChat[];
  currentChatId: string | null;
  currentChat: UnifiedChat | null;
  messages: UnifiedMessage[];
  isLoading: boolean;
  isGenerating: boolean;
  error: string | null;
  searchProgress: {
    stage: "idle" | "searching" | "scraping" | "analyzing" | "generating";
    message?: string;
  };
  featureFlags: typeof DEFAULT_FEATURE_FLAGS;
  // UI state fields
  showFollowUpPrompt: boolean;
  pendingMessage: string;
  plannerHint?: { reason?: string; confidence?: number };
  undoBanner?: { type: "chat" | "message"; id: string; expiresAt: number };
  messageCount: number;
  showShareModal: boolean;
  userHistory: string[];
  isMobile: boolean;
  isSidebarOpen: boolean;
}

export function useChatState() {
  const [state, setState] = useState<ChatState>({
    chats: [],
    currentChatId: null,
    currentChat: null,
    messages: [],
    isLoading: false,
    isGenerating: false,
    error: null,
    searchProgress: { stage: "idle" },
    featureFlags: DEFAULT_FEATURE_FLAGS,
    showFollowUpPrompt: false,
    pendingMessage: "",
    messageCount: 0,
    showShareModal: false,
    userHistory: [],
    isMobile: false,
    isSidebarOpen: false,
  });

  return { state, setState };
}
