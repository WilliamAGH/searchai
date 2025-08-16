import React from "react";
import { describe, it, expect, vi, beforeAll } from "vitest";
import { render, screen } from "@testing-library/react";
import { MessageList } from "../../src/components/MessageList";
import type { Message } from "../../src/lib/types/message";

// Mock Convex React hooks used inside MessageList
vi.mock("convex/react", () => ({
  useMutation: vi.fn(() => {
    // Return a no-op mutation function that returns a resolved promise
    return vi.fn().mockResolvedValue();
  }),
}));

beforeAll(() => {
  // jsdom doesn't implement scrollIntoView by default
  // Provide a no-op to prevent errors during auto-scroll
  // @ts-ignore
  if (!Element.prototype.scrollIntoView) {
    // @ts-ignore
    Element.prototype.scrollIntoView = vi.fn();
  }
});

describe("MessageList streaming rendering", () => {
  function renderWithProps(
    messages: Message[],
    streaming?: {
      isStreaming: boolean;
      streamingContent: string;
      streamingMessageId?: string;
      thinking?: string;
    },
  ) {
    return render(
      <MessageList
        messages={messages}
        isGenerating={true}
        onToggleSidebar={() => {}}
        currentChat={null}
        searchProgress={null}
        onDeleteLocalMessage={() => {}}
        // Only props required by type; pagination/others are optional here
        streamingState={streaming}
      />,
    );
  }

  it("renders incremental assistant content while streaming", () => {
    const assistantId = "msg_stream_1";
    const baseMessages: Message[] = [
      {
        _id: "msg_user_1",
        chatId: "chat_1",
        role: "user",
        content: "Hello?",
        timestamp: Date.now(),
        isLocal: true,
        source: "local",
      },
      {
        _id: assistantId,
        chatId: "chat_1",
        role: "assistant",
        content: "",
        isStreaming: true,
        timestamp: Date.now(),
        isLocal: true,
        source: "local",
      },
    ];

    renderWithProps(baseMessages, {
      isStreaming: true,
      streamingContent: "Partial chunk",
      streamingMessageId: assistantId,
    });

    // Expect the partial chunk to be visible even before completion
    expect(screen.queryByText(/Partial chunk/)).not.toBeNull();
  });
});
