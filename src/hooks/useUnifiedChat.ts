/**
 * Unified Chat Hook
 * Provides a single interface for chat operations regardless of auth status
 * Automatically handles repository selection and migration
 */

import { useMemo } from "react";
import { useConvexAuth } from "convex/react";
import { useChatState } from "./useChatState";
import { useChatRepository } from "./useChatRepository";
import { useChatDataLoader } from "./useChatDataLoader";
import { createChatActions } from "./useChatActions";
import type { ChatState, ChatActions } from "./types";

// Re-export types for backward compatibility
export type { ChatState, ChatActions } from "./types";

export function useUnifiedChat() {
  const { isAuthenticated } = useConvexAuth();

  // Initialize state
  const { state, setState } = useChatState();

  // Get the appropriate repository
  const repository = useChatRepository();

  // Create actions — memoized so function identities are stable across renders.
  // Both deps are referentially stable (setState from useState; repository from context).
  const actions = useMemo(
    () => createChatActions(repository, setState),
    [repository, setState],
  );

  // Handle data loading
  useChatDataLoader(repository, setState);

  return {
    // State
    chats: state.chats,
    currentChatId: state.currentChatId,
    currentChat: state.currentChat,
    messages: state.messages,
    isLoading: state.isLoading,
    isGenerating: state.isGenerating,
    error: state.error,
    searchProgress: state.searchProgress,

    // UI State
    showFollowUpPrompt: state.showFollowUpPrompt,
    pendingMessage: state.pendingMessage,
    plannerHint: state.plannerHint,
    undoBanner: state.undoBanner,
    messageCount: state.messageCount,
    showShareModal: state.showShareModal,
    userHistory: state.userHistory,
    isMobile: state.isMobile,
    isSidebarOpen: state.isSidebarOpen,

    // Auth state
    isAuthenticated,
    repository,

    // Actions
    ...actions,
  };
}
