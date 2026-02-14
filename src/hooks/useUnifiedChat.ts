/**
 * Unified Chat Hook
 * Provides a single interface for chat operations regardless of auth status
 * Automatically handles repository selection and migration
 */

import { useMemo } from "react";
import { useConvexAuth } from "convex/react";
import { useChatState } from "@/hooks/useChatState";
import { useChatRepository } from "@/hooks/useChatRepository";
import { useChatDataLoader } from "@/hooks/useChatDataLoader";
import { createChatActions } from "@/hooks/useChatActions";

// Re-export types for backward compatibility
export type { ChatState, ChatActions } from "@/hooks/types";

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
