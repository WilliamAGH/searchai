import { describe, expect, it } from "vitest";
import type { Message } from "../../../src/lib/types/message";
import { selectEffectiveMessages } from "../../../src/hooks/useEffectiveMessages";

function createMessage(params: {
  id: string;
  chatId: string;
  role?: Message["role"];
  content?: string;
  timestamp?: number;
  persisted?: boolean;
  isStreaming?: boolean;
}): Message {
  return {
    _id: params.id,
    _creationTime: params.timestamp ?? 1,
    chatId: params.chatId,
    role: params.role ?? "assistant",
    content: params.content ?? "",
    timestamp: params.timestamp ?? 1,
    persisted: params.persisted,
    isStreaming: params.isStreaming,
  };
}

describe("selectEffectiveMessages", () => {
  it("ignores unified messages from other chats when paginated data exists", () => {
    const unified = [
      createMessage({ id: "u-old", chatId: "chat-old", content: "old" }),
    ];
    const paginated = [
      createMessage({ id: "p-1", chatId: "chat-new", content: "new" }),
    ];

    const selected = selectEffectiveMessages({
      messages: unified,
      paginatedMessages: paginated,
      currentChatId: "chat-new",
      preferPaginatedSource: true,
      isPaginatedLoading: false,
    });

    expect(selected.map((message) => message._id)).toEqual(["p-1"]);
  });

  it("keeps unified messages while paginated source is loading", () => {
    const unified = [
      createMessage({
        id: "u-1",
        chatId: "chat-1",
        role: "user",
        content: "hello",
      }),
    ];

    const selected = selectEffectiveMessages({
      messages: unified,
      paginatedMessages: [],
      currentChatId: "chat-1",
      preferPaginatedSource: true,
      isPaginatedLoading: true,
    });

    expect(selected.map((message) => message._id)).toEqual(["u-1"]);
  });

  it("uses unified messages when optimistic state is present", () => {
    const unified = [
      createMessage({
        id: "u-optimistic",
        chatId: "chat-1",
        persisted: false,
        isStreaming: true,
      }),
    ];
    const paginated = [
      createMessage({ id: "p-1", chatId: "chat-1", content: "persisted" }),
    ];

    const selected = selectEffectiveMessages({
      messages: unified,
      paginatedMessages: paginated,
      currentChatId: "chat-1",
      preferPaginatedSource: true,
      isPaginatedLoading: false,
    });

    expect(selected.map((message) => message._id)).toEqual(["u-optimistic"]);
  });
});
