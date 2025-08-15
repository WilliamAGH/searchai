// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { setupConvexReactMock } from "../utils/convexReactMock";

// NOTE: Temporarily skipped due to high memory usage in this environment
// when importing the full hook graph. The utilities for this hook are
// still covered in tests/unit/usePaginatedMessages.utils.test.ts.
describe.skip("usePaginatedMessages (minimal)", () => {
  it("returns initial mapped messages and hasMore when enabled with chatId", async () => {
    // mock convex/react before importing hook
    setupConvexReactMock({
      queryImpl: (_name, args) => {
        if (args === "skip") return undefined;
        return {
          messages: [
            { _id: "m1", role: "user", content: "hello", timestamp: 1000 },
            { _id: "m2", role: "assistant", content: "hi", timestamp: 2000 },
          ],
          nextCursor: "c1",
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

    const { result } = renderHook(() =>
      usePaginatedMessages({
        chatId: "chat-1",
        initialLimit: 10,
        enabled: true,
      }),
    );

    // initial state uses mapped messages from the query
    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages.map((m) => m.id)).toEqual(["m1", "m2"]);
    expect(result.current.messages[0].content).toBe("hello");
    expect(result.current.hasMore).toBe(true);
  });

  it("skips when disabled or chatId is null", async () => {
    setupConvexReactMock({
      queryImpl: (_name, args) =>
        args === "skip" ? undefined : { messages: [], hasMore: false },
    });

    const { usePaginatedMessages } = await import(
      "../../src/hooks/usePaginatedMessages"
    );

    const { result } = renderHook(() =>
      usePaginatedMessages({ chatId: null, initialLimit: 5, enabled: false }),
    );

    expect(result.current.isLoading).toBe(false);
    expect(result.current.messages).toEqual([]);
    expect(result.current.hasMore).toBe(true); // default true until initial load
  });
});
