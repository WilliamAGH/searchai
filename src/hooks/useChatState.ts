/**
 * Chat State Management Hook
 * Manages the state for chat operations
 */

import { useState } from "react";
import type { UnifiedChat, UnifiedMessage } from "../lib/types/unified";

/**
 * Complete chat application state interface
 * Manages all UI state, chat data, and user interactions
 * @interface ChatState
 */
export interface ChatState {
  /** List of all available chats */
  chats: UnifiedChat[];
  /** ID of the currently active chat */
  currentChatId: string | null;
  /** Full data of the current chat, null if no chat selected */
  currentChat: UnifiedChat | null;
  /** Messages in the current chat */
  messages: UnifiedMessage[];
  /** General loading state indicator */
  isLoading: boolean;
  /** Flag indicating AI response generation in progress */
  isGenerating: boolean;
  /** Error message to display to user, null if no error */
  error: string | null;
  /** Real-time search progress tracking */
  searchProgress: {
    /** Current stage of the search/response process */
    stage:
      | "idle"
      | "planning"
      | "searching"
      | "scraping"
      | "analyzing"
      | "generating"
      | "finalizing"; // waiting for persistence confirmation
    /** Optional status message for current stage */
    message?: string;
    /** URLs being processed during scraping */
    urls?: string[];
    /** Currently active URL being scraped */
    currentUrl?: string;
    /** Search queries being executed */
    queries?: string[];
    /** Number of sources used in research */
    sourcesUsed?: number;
  };
  // UI state fields
  /** Whether to display follow-up prompt suggestions */
  showFollowUpPrompt: boolean;
  /** Message queued to be sent (e.g., from follow-up click) */
  pendingMessage: string;
  /** Hint about whether planner should be used for next query */
  plannerHint?: { reason?: string; confidence?: number };
  /** Undo action banner configuration */
  undoBanner?: { type: "chat" | "message"; id: string; expiresAt: number };
  /** Counter of messages sent in current session */
  messageCount: number;
  /** Controls share modal visibility */
  showShareModal: boolean;
  /** History of user's previous queries */
  userHistory: string[];
  /** Mobile device detection flag */
  isMobile: boolean;
  /** Sidebar visibility state */
  isSidebarOpen: boolean;
}

/**
 * Hook for managing centralized chat application state
 *
 * Provides a single source of truth for all chat-related state
 * including UI state, data state, and loading indicators
 *
 * @returns {Object} State object and setter function
 * @returns {ChatState} state - Current application state
 * @returns {Function} setState - State update function
 */
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
