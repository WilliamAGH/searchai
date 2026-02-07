import { describe, expect, it } from "vitest";
import type { Message } from "../../../src/lib/types/message";
import {
  mergeInitialPageWithLoadedMessages,
  prependOlderMessages,
} from "../../../src/hooks/utils/paginatedMessages";

function createMessage(
  id: string,
  creationTime: number,
  content: string,
): Message {
  return {
    _id: id,
    _creationTime: creationTime,
    chatId: "chat-1",
    role: "assistant",
    content,
    timestamp: creationTime,
  };
}

describe("paginated message merge helpers", () => {
  it("prepends older page results and preserves chronological order", () => {
    const previous = [
      createMessage("m3", 300, "three"),
      createMessage("m4", 400, "four"),
    ];
    const olderPage = [
      createMessage("m1", 100, "one"),
      createMessage("m2", 200, "two"),
      createMessage("m3", 300, "three-updated"),
    ];

    const merged = prependOlderMessages(previous, olderPage);

    expect(merged.map((message) => message._id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
    ]);
    expect(merged.find((message) => message._id === "m3")?.content).toBe(
      "three",
    );
  });

  it("keeps older loaded pages when reactive initial page updates", () => {
    const previous = [
      createMessage("m1", 100, "one"),
      createMessage("m2", 200, "two"),
      createMessage("m3", 300, "three-old"),
      createMessage("m4", 400, "four-old"),
    ];
    const initialPage = [
      createMessage("m3", 300, "three-new"),
      createMessage("m4", 400, "four-new"),
      createMessage("m5", 500, "five"),
    ];

    const merged = mergeInitialPageWithLoadedMessages(previous, initialPage);

    expect(merged.map((message) => message._id)).toEqual([
      "m1",
      "m2",
      "m3",
      "m4",
      "m5",
    ]);
    expect(merged.find((message) => message._id === "m3")?.content).toBe(
      "three-new",
    );
    expect(merged.find((message) => message._id === "m4")?.content).toBe(
      "four-new",
    );
  });
});
