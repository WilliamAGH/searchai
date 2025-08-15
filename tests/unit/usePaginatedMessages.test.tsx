import { test, expect, describe, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { usePaginatedMessages } from '../../src/hooks/usePaginatedMessages';

// Mock dependencies
vi.mock('convex/react', () => ({
  useQuery: vi.fn(),
  useAction: vi.fn(),
}));

vi.mock('../../convex/_generated/api', () => ({
  api: {
    chats: {
      messagesPaginated: {
        getChatMessagesPaginated: 'getChatMessagesPaginated',
      },
      loadMore: {
        loadMoreMessages: 'loadMoreMessages',
      },
    },
  },
}));

vi.mock('../../src/lib/logger', () => ({
  logger: {
    debug: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    info: vi.fn(),
  },
}));

describe('usePaginatedMessages', () => {
  let mockLoadMore: any;

  beforeEach(() => {
    vi.clearAllMocks();
    
    // Reset performance.now
    vi.spyOn(performance, 'now').mockReturnValue(1000);
    
    // Create mock load more function
    mockLoadMore = vi.fn();
    
    // Set up mocks
    const convexReact = vi.mocked(require('convex/react'));
    convexReact.useAction = vi.fn(() => mockLoadMore);
    convexReact.useQuery = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  test('should initialize with default state', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: null,
      })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(true);
    expect(result.current.isLoadingMore).toBe(false);
    expect(result.current.hasMore).toBe(true);
    expect(result.current.error).toBeNull();
    expect(result.current.retryCount).toBe(0);
    expect(typeof result.current.loadMore).toBe('function');
    expect(typeof result.current.refresh).toBe('function');
    expect(typeof result.current.clearError).toBe('function');
  });

  test('should skip query when chatId is null', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);

    renderHook(() =>
      usePaginatedMessages({
        chatId: null,
      })
    );

    expect(useQuery).toHaveBeenCalledWith(
      'getChatMessagesPaginated',
      'skip'
    );
  });

  test('should query messages when chatId is provided', () => {
    const chatId = 'chat-123';
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);

    renderHook(() =>
      usePaginatedMessages({
        chatId,
        initialLimit: 50,
      })
    );

    expect(useQuery).toHaveBeenCalledWith(
      'getChatMessagesPaginated',
      {
        chatId: 'chat-123',
        limit: 50,
      }
    );
  });

  test('should load initial messages', () => {
    const mockMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'Hello',
          timestamp: 1000,
        },
        {
          _id: 'msg2',
          role: 'assistant',
          content: 'Hi there!',
          timestamp: 2000,
        },
      ],
      nextCursor: 'cursor-123',
      hasMore: true,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(mockMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toMatchObject({
      id: 'msg1',
      role: 'user',
      content: 'Hello',
      timestamp: 1000,
      synced: true,
      source: 'convex',
    });
    expect(result.current.messages[1]).toMatchObject({
      id: 'msg2',
      role: 'assistant',
      content: 'Hi there!',
      timestamp: 2000,
      synced: true,
      source: 'convex',
    });
    expect(result.current.hasMore).toBe(true);
    expect(result.current.isLoading).toBe(false);
  });

  test('should handle empty message list', () => {
    const mockMessages = {
      messages: [],
      nextCursor: undefined,
      hasMore: false,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(mockMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    expect(result.current.messages).toEqual([]);
    expect(result.current.hasMore).toBe(false);
    expect(result.current.isLoading).toBe(false);
  });

  test('should load more messages', async () => {
    const initialMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    };

    const moreMessages = {
      messages: [
        {
          _id: 'msg2',
          role: 'assistant',
          content: 'Second',
          timestamp: 2000,
        },
      ],
      nextCursor: 'cursor-2',
      hasMore: false,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(initialMessages);
    mockLoadMore.mockResolvedValue(moreMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    // Initial state
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.hasMore).toBe(true);

    // Load more
    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(mockLoadMore).toHaveBeenCalledWith({
        chatId: 'chat-123',
        cursor: 'cursor-1',
        limit: 50,
      });
    });
  });

  test('should handle load more error', async () => {
    const initialMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(initialMessages);
    mockLoadMore.mockRejectedValue(new Error('Failed to load'));

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    // Load more
    await act(async () => {
      await result.current.loadMore();
    });

    await waitFor(() => {
      expect(result.current.error).toBeTruthy();
      expect(result.current.error?.message).toBe('Failed to load');
      expect(result.current.isLoadingMore).toBe(false);
    });
  });

  test('should clear error', async () => {
    const initialMessages = {
      messages: [],
      nextCursor: undefined,
      hasMore: false,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(initialMessages);
    mockLoadMore.mockRejectedValue(new Error('Test error'));

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    // Trigger error
    await act(async () => {
      await result.current.loadMore();
    });

    expect(result.current.error).toBeTruthy();

    // Clear error
    act(() => {
      result.current.clearError();
    });

    expect(result.current.error).toBeNull();
  });

  test('should refresh messages', async () => {
    const initialMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(initialMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    const initialCount = result.current.messages.length;

    // Refresh
    await act(async () => {
      await result.current.refresh();
    });

    // Should reset state
    expect(result.current.messages.length).toBe(initialCount);
    expect(result.current.hasMore).toBe(true);
  });

  test('should handle disabled state', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
        enabled: false,
      })
    );

    expect(useQuery).toHaveBeenCalledWith(
      'getChatMessagesPaginated',
      'skip'
    );
    expect(result.current.messages).toEqual([]);
    expect(result.current.isLoading).toBe(true);
  });

  test('should handle chat ID change', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue({
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'Chat 1 message',
          timestamp: 1000,
        },
      ],
      nextCursor: undefined,
      hasMore: false,
    });

    const { result, rerender } = renderHook(
      ({ chatId }) =>
        usePaginatedMessages({
          chatId,
        }),
      {
        initialProps: { chatId: 'chat-1' },
      }
    );

    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].content).toBe('Chat 1 message');

    // Change chat ID
    useQuery.mockReturnValue({
      messages: [
        {
          _id: 'msg2',
          role: 'user',
          content: 'Chat 2 message',
          timestamp: 2000,
        },
      ],
      nextCursor: undefined,
      hasMore: false,
    });

    rerender({ chatId: 'chat-2' });

    expect(useQuery).toHaveBeenCalledWith(
      'getChatMessagesPaginated',
      {
        chatId: 'chat-2',
        limit: 50,
      }
    );
  });

  test('should prevent duplicate load more calls', async () => {
    const initialMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'user',
          content: 'First',
          timestamp: 1000,
        },
      ],
      nextCursor: 'cursor-1',
      hasMore: true,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(initialMessages);
    mockLoadMore.mockImplementation(
      () => new Promise((resolve) => setTimeout(resolve, 100))
    );

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    // Try to load more multiple times
    await act(async () => {
      // These should not all execute
      result.current.loadMore();
      result.current.loadMore();
      result.current.loadMore();
    });

    // Only one call should be made
    expect(mockLoadMore).toHaveBeenCalledTimes(1);
  });

  test('should handle messages with search results', () => {
    const mockMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'assistant',
          content: 'Here are the results',
          timestamp: 1000,
          searchResults: [
            {
              title: 'Result 1',
              snippet: 'Test snippet',
              url: 'http://example.com',
              relevanceScore: 0.9,
            },
          ],
        },
      ],
      nextCursor: undefined,
      hasMore: false,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(mockMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    expect(result.current.messages[0].searchResults).toBeDefined();
    expect(result.current.messages[0].searchResults).toHaveLength(1);
    expect(result.current.messages[0].searchResults?.[0].title).toBe('Result 1');
  });

  test('should handle streaming messages', () => {
    const mockMessages = {
      messages: [
        {
          _id: 'msg1',
          role: 'assistant',
          content: 'Initial content',
          timestamp: 1000,
          isStreaming: true,
          streamedContent: 'Streaming...',
          thinking: 'Processing...',
        },
      ],
      nextCursor: undefined,
      hasMore: false,
    };

    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(mockMessages);

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
      })
    );

    expect(result.current.messages[0].isStreaming).toBe(true);
    expect(result.current.messages[0].streamedContent).toBe('Streaming...');
    expect(result.current.messages[0].thinking).toBe('Processing...');
  });

  test('should handle custom initial limit', () => {
    const { useQuery } = require('convex/react');
    useQuery.mockReturnValue(undefined);

    renderHook(() =>
      usePaginatedMessages({
        chatId: 'chat-123',
        initialLimit: 100,
      })
    );

    expect(useQuery).toHaveBeenCalledWith(
      'getChatMessagesPaginated',
      {
        chatId: 'chat-123',
        limit: 100,
      }
    );
  });
});