import { test, expect, describe, beforeEach, afterEach, vi } from "vitest";
import React from "react";
import { render, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { MessageList } from "../../src/components/MessageList";
import type { Message } from "../../src/lib/types/message";
import type { Chat } from "../../src/lib/types/chat";

// Mock scrollIntoView
Element.prototype.scrollIntoView = vi.fn();

// Mock dependencies
vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => vi.fn()),
}));

vi.mock("../../convex/_generated/api", () => ({
  api: {
    messages: {
      deleteMessage: "deleteMessage",
    },
  },
}));

vi.mock("../../src/lib/logger", () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

// Mock child components to simplify testing
vi.mock("../../src/components/MessageList/EmptyState", () => ({
  EmptyState: vi.fn(() => <div data-testid="empty-state">No messages</div>),
}));

vi.mock("../../src/components/MessageList/MessageItem", () => ({
  MessageItem: vi.fn(({ message }) => (
    <div data-testid={`message-${message.id}`}>{message.content}</div>
  )),
}));

vi.mock("../../src/components/MessageList/ScrollToBottomFab", () => ({
  ScrollToBottomFab: vi.fn(() => null),
}));

vi.mock("../../src/components/MessageList/MessageSkeleton", () => ({
  MessageSkeleton: vi.fn(() => (
    <div data-testid="message-skeleton">Loading...</div>
  )),
  LoadingMoreIndicator: vi.fn(() => (
    <div data-testid="loading-more">Loading more...</div>
  )),
  LoadErrorState: vi.fn(({ onRetry }) => (
    <div data-testid="load-error">
      Error loading messages
      <button onClick={onRetry}>Retry</button>
    </div>
  )),
}));

vi.mock("../../src/components/SearchProgress", () => ({
  SearchProgress: vi.fn(({ progress }) => (
    <div data-testid="search-progress">{progress?.message}</div>
  )),
}));

vi.mock("../../src/components/LoadMoreButton", () => ({
  LoadMoreButton: vi.fn(({ onClick, isLoading }) => (
    <button
      data-testid="load-more-button"
      onClick={onClick}
      disabled={isLoading}
    >
      Load More
    </button>
  )),
}));

vi.mock("../../src/components/MessageList/VirtualizedMessageList", () => ({
  VirtualizedMessageList: vi.fn(() => null),
}));

describe("MessageList", () => {
  const mockOnToggleSidebar = vi.fn();
  const mockOnShare = vi.fn();
  const mockOnDeleteLocalMessage = vi.fn();
  const _mockOnRequestDeleteMessage = vi.fn();
  const mockOnLoadMore = vi.fn();
  const mockOnClearError = vi.fn();

  const mockMessages: Message[] = [
    {
      id: "msg1",
      chatId: "chat1",
      role: "user",
      content: "Hello",
      createdAt: new Date("2024-01-01T10:00:00"),
      isLocal: false,
    },
    {
      id: "msg2",
      chatId: "chat1",
      role: "assistant",
      content: "Hi there!",
      createdAt: new Date("2024-01-01T10:01:00"),
      isLocal: false,
    },
  ];

  const mockChat: Chat = {
    id: "chat1",
    title: "Test Chat",
    createdAt: new Date("2024-01-01T10:00:00"),
    privacy: "private",
    messages: mockMessages,
    metadata: {},
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  test("should render empty state when no messages", () => {
    const { container } = render(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
      />,
    );

    const emptyState = container.querySelector('[data-testid="empty-state"]');
    expect(emptyState).toBeTruthy();
    expect(emptyState?.textContent).toBe("No messages");
  });

  test("should render messages when provided", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
      />,
    );

    const msg1 = container.querySelector('[data-testid="message-msg1"]');
    const msg2 = container.querySelector('[data-testid="message-msg2"]');

    expect(msg1).toBeTruthy();
    expect(msg2).toBeTruthy();
    expect(msg1?.textContent).toBe("Hello");
    expect(msg2?.textContent).toBe("Hi there!");
  });

  test("should show loading skeleton when isLoadingMessages is true", () => {
    const { container } = render(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        isLoadingMessages={true}
      />,
    );

    const skeleton = container.querySelector(
      '[data-testid="message-skeleton"]',
    );
    expect(skeleton).toBeTruthy();
    expect(skeleton?.textContent).toBe("Loading...");
  });

  test("should show search progress when provided", () => {
    const searchProgress = {
      stage: "searching" as const,
      message: "Searching for information...",
      urls: ["http://example.com"],
    };

    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={true}
        onToggleSidebar={mockOnToggleSidebar}
        searchProgress={searchProgress}
      />,
    );

    const progress = container.querySelector('[data-testid="search-progress"]');
    expect(progress).toBeTruthy();
    expect(progress?.textContent).toBe("Searching for information...");
  });

  test("should show load more button when hasMore is true and 50+ messages", () => {
    // Create 50+ messages to meet the minimum threshold
    const manyMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg${i}`,
      chatId: "chat1",
      role: i % 2 === 0 ? "user" : "assistant" as "user" | "assistant",
      content: `Message ${i}`,
      createdAt: new Date(`2024-01-01T10:${String(i).padStart(2, "0")}:00`),
      isLocal: false,
    }));

    const { container } = render(
      <MessageList
        messages={manyMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />,
    );

    const loadMoreButton = container.querySelector(
      '[data-testid="load-more-button"]',
    ) as HTMLButtonElement;
    expect(loadMoreButton).toBeTruthy();
    expect(loadMoreButton?.disabled).toBe(false);
  });

  test("should NOT show load more button when less than 50 messages", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />,
    );

    const loadMoreButton = container.querySelector(
      '[data-testid="load-more-button"]',
    ) as HTMLButtonElement;
    expect(loadMoreButton).toBeFalsy();
  });

  test("should handle load more click", async () => {
    mockOnLoadMore.mockResolvedValue();

    // Create 50+ messages to meet the minimum threshold
    const manyMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg${i}`,
      chatId: "chat1",
      role: i % 2 === 0 ? "user" : "assistant" as "user" | "assistant",
      content: `Message ${i}`,
      createdAt: new Date(`2024-01-01T10:${String(i).padStart(2, "0")}:00`),
      isLocal: false,
    }));

    const { container } = render(
      <MessageList
        messages={manyMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />,
    );

    const loadMoreButton = container.querySelector(
      '[data-testid="load-more-button"]',
    ) as HTMLButtonElement;
    expect(loadMoreButton).toBeTruthy();

    fireEvent.click(loadMoreButton);

    await waitFor(() => {
      expect(mockOnLoadMore).toHaveBeenCalled();
    });
  });

  test("should disable load more button when loading", () => {
    // Create 50+ messages to meet the minimum threshold
    const manyMessages = Array.from({ length: 50 }, (_, i) => ({
      id: `msg${i}`,
      chatId: "chat1",
      role: i % 2 === 0 ? "user" : "assistant" as "user" | "assistant",
      content: `Message ${i}`,
      createdAt: new Date(`2024-01-01T10:${String(i).padStart(2, "0")}:00`),
      isLocal: false,
    }));

    const { container } = render(
      <MessageList
        messages={manyMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
        isLoadingMore={true}
      />,
    );

    const loadMoreButton = container.querySelector(
      '[data-testid="load-more-button"]',
    ) as HTMLButtonElement;
    expect(loadMoreButton).toBeTruthy();
    expect(loadMoreButton?.disabled).toBe(true);
  });

  test("should show loading more indicator", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        isLoadingMore={true}
      />,
    );

    const loadingMore = container.querySelector('[data-testid="loading-more"]');
    expect(loadingMore).toBeTruthy();
    expect(loadingMore?.textContent).toBe("Loading more...");
  });

  test("should show error state when loadError is provided", () => {
    const error = new Error("Failed to load messages");

    const { container } = render(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        loadError={error}
        onClearError={mockOnClearError}
      />,
    );

    const loadError = container.querySelector('[data-testid="load-error"]');
    expect(loadError).toBeTruthy();
    expect(loadError?.textContent).toContain("Error loading messages");
  });

  test("should handle retry on error", () => {
    const error = new Error("Failed to load messages");

    const { container } = render(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        loadError={error}
        onClearError={mockOnClearError}
      />,
    );

    const retryButton = container.querySelector("button");
    expect(retryButton).toBeTruthy();

    if (retryButton) {
      fireEvent.click(retryButton);
      expect(mockOnClearError).toHaveBeenCalled();
    }
  });

  test("should handle delete local message", () => {
    const localMessage: Message = {
      id: "local-msg",
      chatId: "chat1",
      role: "user",
      content: "Local message",
      createdAt: new Date(),
      isLocal: true,
    };

    const { container } = render(
      <MessageList
        messages={[localMessage]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        onDeleteLocalMessage={mockOnDeleteLocalMessage}
      />,
    );

    const msg = container.querySelector('[data-testid="message-local-msg"]');
    expect(msg).toBeTruthy();
    expect(msg?.textContent).toBe("Local message");
  });

  test("should handle streaming state", () => {
    const streamingState = {
      isStreaming: true,
      streamingContent: "Streaming content...",
      streamingMessageId: "msg3",
      thinking: "Thinking...",
    };

    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={true}
        onToggleSidebar={mockOnToggleSidebar}
        streamingState={streamingState}
      />,
    );

    const msg1 = container.querySelector('[data-testid="message-msg1"]');
    const msg2 = container.querySelector('[data-testid="message-msg2"]');

    expect(msg1).toBeTruthy();
    expect(msg2).toBeTruthy();
  });

  test("should render with current chat", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        currentChat={mockChat}
        onShare={mockOnShare}
      />,
    );

    const msg1 = container.querySelector('[data-testid="message-msg1"]');
    const msg2 = container.querySelector('[data-testid="message-msg2"]');

    expect(msg1).toBeTruthy();
    expect(msg2).toBeTruthy();
  });

  test("should handle multiple messages with pagination", () => {
    const manyMessages: Message[] = Array.from({ length: 50 }, (_, i) => ({
      id: `msg${i}`,
      chatId: "chat1",
      role: i % 2 === 0 ? "user" : "assistant",
      content: `Message ${i}`,
      createdAt: new Date(`2024-01-01T10:${i.toString().padStart(2, "0")}:00`),
      isLocal: false,
    }));

    const { container } = render(
      <MessageList
        messages={manyMessages}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        hasMore={true}
        onLoadMore={mockOnLoadMore}
      />,
    );

    const msg0 = container.querySelector('[data-testid="message-msg0"]');
    const msg1 = container.querySelector('[data-testid="message-msg1"]');
    const loadMore = container.querySelector(
      '[data-testid="load-more-button"]',
    );

    expect(msg0).toBeTruthy();
    expect(msg1).toBeTruthy();
    expect(loadMore).toBeTruthy();
  });

  test("should handle empty search progress", () => {
    const { container } = render(
      <MessageList
        messages={mockMessages}
        isGenerating={true}
        onToggleSidebar={mockOnToggleSidebar}
        searchProgress={null}
      />,
    );

    const msg1 = container.querySelector('[data-testid="message-msg1"]');
    const searchProgress = container.querySelector(
      '[data-testid="search-progress"]',
    );

    expect(msg1).toBeTruthy();
    expect(searchProgress).toBeFalsy();
  });

  test("should handle message with search results", () => {
    const messageWithResults: Message = {
      id: "msg-with-results",
      chatId: "chat1",
      role: "assistant",
      content: "Here are the search results",
      createdAt: new Date(),
      isLocal: false,
      searchResults: [
        {
          title: "Result 1",
          snippet: "Snippet 1",
          url: "http://example.com/1",
          relevanceScore: 0.9,
        },
      ],
    };

    const { container } = render(
      <MessageList
        messages={[messageWithResults]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
      />,
    );

    const msg = container.querySelector(
      '[data-testid="message-msg-with-results"]',
    );
    expect(msg).toBeTruthy();
    expect(msg?.textContent).toBe("Here are the search results");
  });

  test("should handle retry count changes", () => {
    const { container, rerender } = render(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        loadError={new Error("Failed")}
        retryCount={0}
        onClearError={mockOnClearError}
      />,
    );

    let loadError = container.querySelector('[data-testid="load-error"]');
    expect(loadError).toBeTruthy();

    // Simulate retry
    rerender(
      <MessageList
        messages={[]}
        isGenerating={false}
        onToggleSidebar={mockOnToggleSidebar}
        loadError={null}
        retryCount={1}
        onClearError={mockOnClearError}
      />,
    );

    loadError = container.querySelector('[data-testid="load-error"]');
    expect(loadError).toBeFalsy();
  });
});
