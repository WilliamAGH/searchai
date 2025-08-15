import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { renderHook } from "@testing-library/react";
import { useUnifiedChat } from "../../src/hooks/useUnifiedChat";

// Mock dependencies
vi.mock("convex/react", () => ({
  useConvexAuth: vi.fn(() => ({ isAuthenticated: false })),
}));

vi.mock("../../src/hooks/useChatState", () => ({
  useChatState: vi.fn(() => ({
    state: {
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
      isSidebarOpen: false,
    },
    setState: vi.fn(),
  })),
}));

vi.mock("../../src/hooks/useChatRepository", () => ({
  useChatRepository: vi.fn(() => ({
    listChats: vi.fn().mockResolvedValue([]),
    createChat: vi.fn().mockResolvedValue({ id: "test-chat-1" }),
    getChat: vi.fn().mockResolvedValue(null),
    deleteChat: vi.fn().mockResolvedValue(undefined),
    sendMessage: vi.fn().mockResolvedValue({ id: "test-message-1" }),
  })),
}));

vi.mock("../../src/hooks/useChatMigration", () => ({
  useChatMigration: vi.fn(),
}));

vi.mock("../../src/hooks/useChatDataLoader", () => ({
  useChatDataLoader: vi.fn(),
}));

vi.mock("../../src/hooks/useChatActions", () => ({
  createChatActions: vi.fn(() => ({
    createChat: vi.fn(),
    deleteChat: vi.fn(),
    setCurrentChat: vi.fn(),
    sendMessage: vi.fn(),
    retryMessage: vi.fn(),
    clearError: vi.fn(),
    refreshChats: vi.fn(),
    clearSearchProgress: vi.fn(),
    setShowFollowUpPrompt: vi.fn(),
    setPendingMessage: vi.fn(),
    setPlannerHint: vi.fn(),
    setUndoBanner: vi.fn(),
    setMessageCount: vi.fn(),
    setShowShareModal: vi.fn(),
    setUserHistory: vi.fn(),
    setIsSidebarOpen: vi.fn(),
    deleteMessage: vi.fn(),
  })),
}));

vi.mock("../../src/hooks/useStreamingChat", () => ({
  useStreamingChat: vi.fn(() => ({
    isStreaming: false,
    streamingMessage: null,
  })),
}));

describe("useUnifiedChat", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test("should initialize with default state", () => {
    const { result } = renderHook(() => useUnifiedChat());

    // Check initial state
    expect(result.current.chats).toEqual([]);
    expect(result.current.currentChatId).toBeNull();
    expect(result.current.currentChat).toBeNull();
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(false);
    expect(result.current.isGenerating).toBe(false);
    expect(result.current.error).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  test("should provide all required actions", () => {
    const { result } = renderHook(() => useUnifiedChat());

    // Check that all actions are present
    expect(typeof result.current.createChat).toBe("function");
    expect(typeof result.current.deleteChat).toBe("function");
    expect(typeof result.current.setCurrentChat).toBe("function");
    expect(typeof result.current.sendMessage).toBe("function");
    expect(typeof result.current.retryMessage).toBe("function");
    expect(typeof result.current.clearError).toBe("function");
    expect(typeof result.current.refreshChats).toBe("function");
    expect(typeof result.current.clearSearchProgress).toBe("function");
    expect(typeof result.current.setShowFollowUpPrompt).toBe("function");
    expect(typeof result.current.setPendingMessage).toBe("function");
    expect(typeof result.current.setIsSidebarOpen).toBe("function");
  });

  test("should include repository reference", () => {
    const { result } = renderHook(() => useUnifiedChat());

    expect(result.current.repository).toBeDefined();
    expect(typeof result.current.repository.listChats).toBe("function");
    expect(typeof result.current.repository.createChat).toBe("function");
    expect(typeof result.current.repository.getChat).toBe("function");
    expect(typeof result.current.repository.deleteChat).toBe("function");
    expect(typeof result.current.repository.sendMessage).toBe("function");
  });

  test("should include streaming state", () => {
    const { result } = renderHook(() => useUnifiedChat());

    expect(result.current.streamingState).toBeDefined();
    expect(result.current.streamingState.isStreaming).toBe(false);
    expect(result.current.streamingState.streamingMessage).toBeNull();
  });

  test("should handle authenticated state", async () => {
    const { useConvexAuth } = await import("convex/react");
    useConvexAuth.mockReturnValue({ isAuthenticated: true });

    const { result } = renderHook(() => useUnifiedChat());

    expect(result.current.isAuthenticated).toBe(true);
  });

  test("should handle UI state properties", () => {
    const { result } = renderHook(() => useUnifiedChat());

    // Check UI state
    expect(result.current.showFollowUpPrompt).toBe(false);
    expect(result.current.pendingMessage).toBe("");
    expect(result.current.plannerHint).toBeNull();
    expect(result.current.undoBanner).toBeNull();
    expect(result.current.messageCount).toBe(0);
    expect(result.current.showShareModal).toBe(false);
    expect(result.current.userHistory).toEqual([]);
    expect(result.current.isMobile).toBe(false);
    expect(result.current.isSidebarOpen).toBe(false);
  });

  test("should update state when chat state changes", async () => {
    const { useChatState } = await import("../../src/hooks/useChatState");
    const mockSetState = vi.fn();

    // Initial render with empty state
    useChatState.mockReturnValue({
      state: {
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
        isSidebarOpen: false,
      },
      setState: mockSetState,
    });

    const { result, rerender } = renderHook(() => useUnifiedChat());

    expect(result.current.chats).toEqual([]);
    expect(result.current.currentChatId).toBeNull();

    // Update mock to return new state
    const newChat = { id: "chat-1", messages: [] };
    useChatState.mockReturnValue({
      state: {
        chats: [newChat],
        currentChatId: "chat-1",
        currentChat: newChat,
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
        isSidebarOpen: false,
      },
      setState: mockSetState,
    });

    // Trigger re-render
    rerender();

    // Check updated state
    expect(result.current.chats).toEqual([newChat]);
    expect(result.current.currentChatId).toBe("chat-1");
    expect(result.current.currentChat).toEqual(newChat);
  });

  test("should handle error state", async () => {
    const { useChatState } = await import("../../src/hooks/useChatState");

    const testError = new Error("Test error");
    useChatState.mockReturnValue({
      state: {
        chats: [],
        currentChatId: null,
        currentChat: null,
        messages: [],
        isLoading: false,
        isGenerating: false,
        error: testError,
        searchProgress: null,
        showFollowUpPrompt: false,
        pendingMessage: "",
        plannerHint: null,
        undoBanner: null,
        messageCount: 0,
        showShareModal: false,
        userHistory: [],
        isMobile: false,
        isSidebarOpen: false,
      },
      setState: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedChat());

    expect(result.current.error).toEqual(testError);
  });

  test("should handle loading states", async () => {
    const { useChatState } = await import("../../src/hooks/useChatState");

    useChatState.mockReturnValue({
      state: {
        chats: [],
        currentChatId: null,
        currentChat: null,
        messages: [],
        isLoading: true,
        isGenerating: true,
        error: null,
        searchProgress: { status: "searching", query: "test" },
        showFollowUpPrompt: false,
        pendingMessage: "",
        plannerHint: null,
        undoBanner: null,
        messageCount: 0,
        showShareModal: false,
        userHistory: [],
        isMobile: false,
        isSidebarOpen: false,
      },
      setState: vi.fn(),
    });

    const { result } = renderHook(() => useUnifiedChat());

    expect(result.current.isLoading).toBe(true);
    expect(result.current.isGenerating).toBe(true);
    expect(result.current.searchProgress).toEqual({
      status: "searching",
      query: "test",
    });
  });
});
