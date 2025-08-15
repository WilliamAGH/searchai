import { describe, it, expect } from "vitest";

describe("currentChat derivation", () => {
  function deriveCurrentChat(
    currentChatId: string | null,
    allChats: Array<{ _id: string; title: string }>,
  ) {
    if (!currentChatId) return;
    const idStr = String(currentChatId);
    return allChats.find((c) => String(c._id) === idStr);
  }

  const chats = [
    { _id: "local_1", title: "Local A" },
    { _id: "abc123serverid", title: "Server A" },
  ];

  it("matches local chat id", () => {
    expect(deriveCurrentChat("local_1", chats)?.title).toBe("Local A");
  });

  it("matches server chat id", () => {
    expect(deriveCurrentChat("abc123serverid", chats)?.title).toBe("Server A");
  });

  it("returns undefined for null id", () => {
    expect(deriveCurrentChat(null, chats)).toBeUndefined();
  });
});
