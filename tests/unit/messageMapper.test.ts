import { describe, it, expect, vi } from "vitest";
import { mapMessagesToLocal } from "../../src/lib/utils/messageMapper";

describe("mapMessagesToLocal", () => {
  it("maps id/_id and applies defaults", () => {
    const now = 1700000001000;
    vi.spyOn(Date, "now").mockReturnValue(now);

    const input = [
      { id: "a1", chatId: "c1", role: "user", content: undefined },
      { _id: "a2", chatId: "c2", role: "assistant", timestamp: 123 },
    ] as any;

    const out = mapMessagesToLocal(input, false);
    expect(out[0]).toMatchObject({
      _id: "a1",
      chatId: "c1",
      role: "user",
      content: "",
      isLocal: true,
    });
    expect(typeof out[0].timestamp).toBe("number");
    expect(out[1]).toMatchObject({ _id: "a2", chatId: "c2", timestamp: 123 });

    (Date.now as unknown as vi.SpyInstance).mockRestore?.();
  });

  it("passes through optional fields", () => {
    const input = [
      {
        id: "m1",
        chatId: "c1",
        role: "assistant",
        content: "hi",
        searchResults: [
          { title: "t", url: "u", snippet: "s", relevanceScore: 0.1 },
        ],
        sources: ["a"],
        reasoning: "thoughts",
      },
    ] as any;

    const out = mapMessagesToLocal(input, true);
    expect(out[0]).toMatchObject({
      _id: "m1",
      searchResults: input[0].searchResults,
      sources: ["a"],
      reasoning: "thoughts",
      isLocal: false,
    });
  });
});
