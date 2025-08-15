/**
 * @fileoverview CRITICAL REGRESSION TEST FOR CHAT TOOLBAR VISIBILITY
 *
 * ⚠️ DO NOT MODIFY OR DELETE THIS TEST ⚠️
 *
 * This test suite prevents a recurring regression where the Copy/Share toolbar
 * appears on empty chats. This has happened multiple times when developers
 * "fix" failing tests by removing the messages.length check.
 *
 * REGRESSION HISTORY:
 * - The toolbar keeps appearing on empty chats
 * - Developers remove the messages.length > 0 check to "fix" tests
 * - Users see Copy/Share buttons with nothing to copy/share
 * - This creates a poor UX and confuses users
 *
 * THE RULE:
 * ChatToolbar should ONLY render when:
 * 1. currentChatId exists (chat is in database)
 * 2. messages.length > 0 (there's content to share)
 *
 * See: docs/CHAT_TOOLBAR_REGRESSION_PREVENTION.md
 */

import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ChatInterface } from "../../src/components/ChatInterface";

// Mock all the dependencies
vi.mock("convex/react", () => ({
  useAction: vi.fn(() => vi.fn()),
  useMutation: vi.fn(() => vi.fn()),
  useQuery: vi.fn(),
}));

vi.mock("../../src/hooks/useUnifiedChat", () => ({
  useUnifiedChat: vi.fn(() => ({
    chats: [],
    currentChatId: null,
    currentChat: null,
    messages: [],
    isLoading: false,
    isGenerating: false,
    error: null,
    searchProgress: null,
    showFollowUpPrompt: false,
    pendingMessage: "",
    plannerHint: null,
    undoBanner: null,
    messageCount: 0,
    showShareModal: false,
    userHistory: [],
    isMobile: false,
    createChat: vi.fn(),
    selectChat: vi.fn(),
    deleteChat: vi.fn(),
    updateChatTitle: vi.fn(),
    setChats: vi.fn(),
    addChat: vi.fn(),
    removeChat: vi.fn(),
    updateChat: vi.fn(),
    sendMessage: vi.fn(),
    deleteMessage: vi.fn(),
    addMessage: vi.fn(),
    removeMessage: vi.fn(),
    updateMessage: vi.fn(),
    setMessages: vi.fn(),
    shareChat: vi.fn(),
    handleToggleSidebar: vi.fn(),
    handleContinueChat: vi.fn(),
    handleNewChatForFollowUp: vi.fn(),
    handleNewChatWithSummary: vi.fn(),
    handleDraftChange: vi.fn(),
    handleShare: vi.fn(),
    handleRequestDeleteChat: vi.fn(),
    handleRequestDeleteMessage: vi.fn(),
    setShowFollowUpPrompt: vi.fn(),
    setShowShareModal: vi.fn(),
    setPendingMessage: vi.fn(),
    addToHistory: vi.fn(),
    refreshChats: vi.fn(),
    clearError: vi.fn(),
    clearLocalStorage: vi.fn(),
    streamingState: null,
  })),
}));

// Mock other hooks
vi.mock("../../src/hooks/useChatNavigation", () => ({
  useChatNavigation: vi.fn(() => ({
    navigateWithVerification: vi.fn(),
    handleSelectChat: vi.fn(),
  })),
}));

vi.mock("../../src/hooks/useServices", () => ({
  useServices: vi.fn(() => ({ aiService: null })),
}));

describe("ChatToolbar Regression Prevention", () => {
  /**
   * CRITICAL TEST #1: Toolbar must NOT appear on empty chat
   * This is the most important test - it catches the regression
   */
  it("❌ MUST NOT show ChatToolbar when chat has no messages", () => {
    const { useUnifiedChat } = require("../../src/hooks/useUnifiedChat");
    useUnifiedChat.mockReturnValue({
      ...useUnifiedChat(),
      currentChatId: "test-chat-id", // Chat exists
      messages: [], // But NO messages
    });

    render(<ChatInterface isAuthenticated={false} isSidebarOpen={false} />);

    // The Share button should NOT exist
    const shareButton = screen.queryByLabelText("Share chat");
    expect(shareButton).not.toBeInTheDocument();

    // The Copy button should NOT exist
    const copyButton = screen.queryByLabelText("Copy all messages");
    expect(copyButton).not.toBeInTheDocument();
  });

  /**
   * CRITICAL TEST #2: Toolbar must NOT appear when no chat ID
   */
  it("❌ MUST NOT show ChatToolbar when currentChatId is null", () => {
    const { useUnifiedChat } = require("../../src/hooks/useUnifiedChat");
    useUnifiedChat.mockReturnValue({
      ...useUnifiedChat(),
      currentChatId: null, // No chat ID
      messages: [{ id: "1", content: "test", role: "user" }], // Has messages
    });

    render(<ChatInterface isAuthenticated={false} isSidebarOpen={false} />);

    // The Share button should NOT exist
    const shareButton = screen.queryByLabelText("Share chat");
    expect(shareButton).not.toBeInTheDocument();

    // The Copy button should NOT exist
    const copyButton = screen.queryByLabelText("Copy all messages");
    expect(copyButton).not.toBeInTheDocument();
  });

  /**
   * TEST #3: Toolbar SHOULD appear when both conditions are met
   */
  it("✅ SHOULD show ChatToolbar when chat has ID and messages", () => {
    const { useUnifiedChat } = require("../../src/hooks/useUnifiedChat");
    useUnifiedChat.mockReturnValue({
      ...useUnifiedChat(),
      currentChatId: "test-chat-id", // Chat exists
      messages: [{ id: "1", content: "Hello", role: "user" }], // Has messages
    });

    render(<ChatInterface isAuthenticated={false} isSidebarOpen={false} />);

    // Now the buttons SHOULD exist
    const shareButton = screen.queryByLabelText("Share chat");
    expect(shareButton).toBeInTheDocument();

    const copyButton = screen.queryByLabelText("Copy all messages");
    expect(copyButton).toBeInTheDocument();
  });

  /**
   * TEST #4: Verify the exact conditional logic
   * This test ensures the condition is implemented correctly
   */
  it("validates the exact conditional rendering logic", () => {
    // This is more of a documentation test to show the required logic
    const shouldShowToolbar = (
      currentChatId: string | null,
      messages: any[],
    ) => {
      // THIS IS THE REQUIRED LOGIC - DO NOT CHANGE
      return currentChatId && messages.length > 0;
    };

    // Test all combinations
    expect(shouldShowToolbar(null, [])).toBe(false); // No chat, no messages
    expect(shouldShowToolbar(null, ["msg"])).toBe(false); // No chat, has messages
    expect(shouldShowToolbar("chat-id", [])).toBe(false); // Has chat, no messages ⚠️
    expect(shouldShowToolbar("chat-id", ["msg"])).toBe(true); // Has chat, has messages ✅

    // The third case (has chat, no messages) is the regression case
    // If this returns true, the regression has occurred
  });
});

/**
 * IF THESE TESTS FAIL:
 *
 * 1. DO NOT remove or modify the tests
 * 2. DO NOT change the test expectations
 * 3. DO fix the implementation in ChatInterface.tsx
 * 4. The toolbar condition must be: currentChatId && messages.length > 0
 * 5. Read docs/CHAT_TOOLBAR_REGRESSION_PREVENTION.md
 *
 * The UX principle is simple:
 * - No messages = Nothing to share = No share button
 * - Empty chat = Nothing to copy = No copy button
 */
