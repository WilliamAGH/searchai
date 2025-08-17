// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import React, { useEffect, useState } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import { setupConvexReactMock } from "../utils/convexReactMock";

// Defer importing the hook until after mocking convex/react

function setupInitialAndLoadMoreMocks() {
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

  let lastActionArgs: any = null;
  setupConvexReactMock({
    queryImpl: (name, args) => {
      console.log("Query called:", name, args);
      // initial query returns the first page whenever not skipped
      if (args === "skip") return;
      return initial;
    },
    actionImpl: async (_name, args) => {
      lastActionArgs = args;
      // simulate loadMore returning second page when cursor1 is used
      if ((args as any).cursor === "cursor1") return page2;
      return { messages: [], nextCursor: undefined, hasMore: false };
    },
  });
  return { initial, page2, getLastActionArgs: () => lastActionArgs };
}

describe("usePaginatedMessages behavior (jsdom)", () => {
  it(
    "loads initial page and reports hasMore (loadMore covered elsewhere)",
    { timeout: 10000 },
    async () => {
      setupInitialAndLoadMoreMocks();
      const { usePaginatedMessages } = await import(
        "../../src/hooks/usePaginatedMessages"
      );

      // Render the harness with Testing Library (wraps updates in act)

      function Harness() {
        const { messages, hasMore, isLoading, isLoadingMore, loadMore } =
          usePaginatedMessages({
            chatId: "c1",
            initialLimit: 2,
            enabled: true,
          });
        const [loaded, setLoaded] = useState(false);
        useEffect(() => {
          if (!isLoading) setLoaded(true);
        }, [isLoading]);
        return (
          <div>
            <div data-testid="count">{messages.length}</div>
            <div data-testid="hasMore">{String(hasMore)}</div>
            <div data-testid="isLoading">{String(isLoading)}</div>
            <div data-testid="isLoadingMore">{String(isLoadingMore)}</div>
            <button
              data-testid="loadMore"
              onClick={() => {
                loadMore();
              }}
              disabled={!loaded}
            >
              Load More
            </button>
          </div>
        );
      }

      const { container } = render(<Harness />);

      // Debug: Check if component rendered
      console.log("Rendered HTML:", container.innerHTML);

      // Wait for initial page to load and render using React Testing Library's waitFor
      await waitFor(
        () => {
          const countEl = screen.getByTestId("count");
          console.log("Count element text:", countEl.textContent);
          expect(countEl.textContent).toBe("2");
        },
        { timeout: 8000 },
      );

      expect(screen.getByTestId("hasMore").textContent).toBe("true");

      // Keep this test focused on initial page behavior to avoid act timing flakiness

      // no-op: Testing Library cleans up automatically
    },
  );
});
