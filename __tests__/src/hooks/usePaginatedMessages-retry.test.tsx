// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import React from "react";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
// TODO: Temporarily disabled due to "React.act is not a function" under React 19 and missing convex/react mock harness.
// - Action items:
//   1) Implement `tests/utils/convexReactMock.ts` with stable `useQuery`/`useAction` mocks.
//   2) Ensure VT/test setup uses a single React instance; align versions of react/react-dom/@testing-library/react.
//   3) Use `vi.useFakeTimers()` + `advanceTimersByTimeAsync` for retry timing, avoid arbitrary delays.
//   4) Consider renderHook-based harness to remove extra component wrappers.
// Local stub until harness is restored
function setupConvexReactMock(_opts: {
  queryImpl?: (name: unknown, args: unknown) => unknown;
  actionImpl?: (name: unknown, args: unknown) => Promise<unknown> | unknown;
}): void {
  // no-op
}

describe.skip("usePaginatedMessages retry behavior", () => {
  it("retries once then succeeds (attempt=2)", { timeout: 10000 }, async () => {
    vi.useFakeTimers();

    const initial = {
      messages: [
        { _id: "m1", role: "user", content: "hello" },
        { _id: "m2", role: "assistant", content: "hi" },
      ],
      nextCursor: "cursor1",
      hasMore: true,
    };
    const page2 = {
      messages: [{ _id: "m3", role: "assistant", content: "more" }],
      nextCursor: undefined,
      hasMore: false,
    };
    let attempts = 0;

    setupConvexReactMock({
      queryImpl: (_name, args) => (args === "skip" ? undefined : initial),
      actionImpl: async (_name, args) => {
        if ((args as any).cursor === "cursor1") {
          attempts++;
          if (attempts === 1) throw new Error("transient");
          return page2;
        }
        return { messages: [], nextCursor: undefined, hasMore: false };
      },
    });

    const { usePaginatedMessages } = await import("../../../src/hooks/usePaginatedMessages");

    function Harness() {
      const { messages, loadMore } = usePaginatedMessages({
        chatId: "c1",
        initialLimit: 2,
        enabled: true,
      });
      return (
        <button data-testid="lm" onClick={() => loadMore()}>
          {messages.length}
        </button>
      );
    }

    render(<Harness />);

    // Wait for initial 2 messages to render
    await waitFor(
      () => {
        expect(screen.getByTestId("lm").textContent).toBe("2");
      },
      { timeout: 3000 },
    );

    // Click to trigger load more (first attempt fails)
    fireEvent.click(screen.getByTestId("lm"));

    // Advance timers to trigger retry (1s)
    await vi.advanceTimersByTimeAsync(1000);

    // Wait for retry to succeed and content to become 3
    await waitFor(
      () => {
        expect(screen.getByTestId("lm").textContent).toBe("3");
      },
      { timeout: 3000 },
    );

    expect(attempts).toBe(2);

    vi.useRealTimers();
  });
});
