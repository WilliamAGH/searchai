// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, waitFor } from "@testing-library/react";

// Using centralized convex/react mock utility for React 19 compatibility
import { setupConvexReactMock } from "../utils/convexReactMock";

describe("usePaginatedMessages basic functionality", () => {
  it("transforms messages correctly", async () => {
    // Setup simple mock
    setupConvexReactMock({
      queryImpl: (_name, args) => {
        if (args === "skip") return;
        return {
          messages: [
            { _id: "m1", role: "user", content: "hello", timestamp: 1000 },
            { _id: "m2", role: "assistant", content: "hi", timestamp: 2000 },
          ],
          nextCursor: "cursor1",
          hasMore: true,
        };
      },
      actionImpl: async () => ({
        messages: [],
        nextCursor: undefined,
        hasMore: false,
      }),
    });

    const { usePaginatedMessages } = await import(
      "../../src/hooks/usePaginatedMessages"
    );

    // Create a test harness component that uses the hook
    let hookResult: any = null;
    function TestHarness() {
      hookResult = usePaginatedMessages({
        chatId: "test-chat",
        initialLimit: 10,
        enabled: true,
      });
      return <div>Test</div>;
    }

    // Render the component to use the hook
    render(<TestHarness />);

    // Wait for the hook to initialize
    await waitFor(() => {
      expect(hookResult).not.toBeNull();
    });

    // Verify the returned state
    expect(hookResult.messages).toHaveLength(2);
    expect(hookResult.messages[0].id).toBe("m1");
    expect(hookResult.messages[0].content).toBe("hello");
    expect(hookResult.messages[1].id).toBe("m2");
    expect(hookResult.messages[1].content).toBe("hi");
    expect(hookResult.hasMore).toBe(true);
    expect(hookResult.isLoading).toBe(false);
    expect(typeof hookResult.loadMore).toBe("function");
  });

  it("handles empty results", async () => {
    // Reset modules to ensure clean mock state
    vi.resetModules();

    setupConvexReactMock({
      queryImpl: () => ({
        messages: [],
        nextCursor: undefined,
        hasMore: false,
      }),
      actionImpl: async () => ({
        messages: [],
        nextCursor: undefined,
        hasMore: false,
      }),
    });

    const { usePaginatedMessages } = await import(
      "../../src/hooks/usePaginatedMessages"
    );

    let hookResult: any = null;
    function TestHarness() {
      hookResult = usePaginatedMessages({
        chatId: "empty-chat",
        initialLimit: 10,
        enabled: true,
      });
      return <div>Test</div>;
    }

    render(<TestHarness />);

    await waitFor(() => {
      expect(hookResult).not.toBeNull();
    });

    expect(hookResult.messages).toHaveLength(0);
    expect(hookResult.hasMore).toBe(false);
  });

  it("skips query when disabled", async () => {
    let queryCalled = false;
    setupConvexReactMock({
      queryImpl: (_name, args) => {
        if (args !== "skip") queryCalled = true;
        return;
      },
      actionImpl: async () => ({
        messages: [],
        nextCursor: undefined,
        hasMore: false,
      }),
    });

    const { usePaginatedMessages } = await import(
      "../../src/hooks/usePaginatedMessages"
    );

    let hookResult: any = null;
    function TestHarness() {
      hookResult = usePaginatedMessages({
        chatId: "test-chat",
        initialLimit: 10,
        enabled: false, // Disabled
      });
      return <div>Test</div>;
    }

    render(<TestHarness />);

    await waitFor(() => {
      expect(hookResult).not.toBeNull();
    });

    expect(queryCalled).toBe(false);
    expect(hookResult.messages).toHaveLength(0);
    expect(hookResult.isLoading).toBe(false);
  });
});
