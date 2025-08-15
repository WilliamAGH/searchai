import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";

import {
  computeBackoffDelay,
  mapConvexMessagesToUnified,
} from "../../src/hooks/usePaginatedMessages";

describe("usePaginatedMessages utilities", () => {
  describe("computeBackoffDelay", () => {
    it("returns exponential backoff capped at 5000ms", () => {
      expect(computeBackoffDelay(1)).toBe(1000);
      expect(computeBackoffDelay(2)).toBe(2000);
      expect(computeBackoffDelay(3)).toBe(4000);
      expect(computeBackoffDelay(4)).toBe(5000); // capped
      expect(computeBackoffDelay(5)).toBe(5000); // still capped
    });

    it("handles zero/negative attempts by returning base delay", () => {
      expect(computeBackoffDelay(0)).toBe(1000);
      expect(computeBackoffDelay(-1)).toBe(1000);
    });
  });

  describe("mapConvexMessagesToUnified", () => {
    const now = 1700000000000;

    beforeAll(() => {
      vi.spyOn(Date, "now").mockReturnValue(now);
    });

    afterAll(() => {
      (Date.now as unknown as vi.SpyInstance).mockRestore?.();
    });

    it("maps core fields and applies defaults", () => {
      const input = [{ _id: "m1", role: "user" as const, content: undefined }];
      const out = mapConvexMessagesToUnified("chat-1", input);

      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({
        id: "m1",
        chatId: "chat-1",
        role: "user",
        content: "", // default
        timestamp: now, // default
        synced: true,
        source: "convex",
      });
    });

    it("coerces and filters searchResults and sources types", () => {
      const input = [
        {
          _id: "m2",
          role: "assistant" as const,
          searchResults: [
            { title: "t", url: "u", snippet: "s", relevanceScore: 0.5 }, // valid
            { title: "t2", url: "u2", snippet: 123, relevanceScore: 0.1 }, // invalid snippet type
          ],
          sources: ["a", 1, null, "b"],
        },
      ];

      const out = mapConvexMessagesToUnified("chat-1", input);
      expect(out[0].searchResults).toEqual([
        { title: "t", url: "u", snippet: "s", relevanceScore: 0.5 },
      ]);
      expect(out[0].sources).toEqual(["a", "b"]);
    });

    it("falls back chatId to empty string when null is provided", () => {
      const out = mapConvexMessagesToUnified(null, [
        { _id: "m3", role: "user" as const },
      ]);
      expect(out[0].chatId).toBe("");
    });
  });
});
