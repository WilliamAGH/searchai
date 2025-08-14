import { describe, it, expect } from "vitest";
import {
  computeBackoffDelay,
  mapConvexMessagesToUnified,
} from "../../src/hooks/usePaginatedMessages";

// NOTE: Pagination critical path tests scaffold. Initially skipped;
// will be enabled once a stable backend test harness is available.

describe("Pagination critical path (unit subset)", () => {
  it("computes exponential backoff with cap", () => {
    expect(computeBackoffDelay(1)).toBe(1000);
    expect(computeBackoffDelay(2)).toBe(2000);
    expect(computeBackoffDelay(3)).toBe(4000);
    expect(computeBackoffDelay(4)).toBe(5000); // capped
    expect(computeBackoffDelay(5)).toBe(5000); // capped
  });

  it("maps convex docs to unified messages", () => {
    const now = Date.now();
    const docs = [
      {
        _id: "m1",
        role: "user" as const,
        content: "hello",
        timestamp: now,
      },
      { _id: "m2", role: "assistant" as const }, // missing content/timestamp
    ];
    const unified = mapConvexMessagesToUnified("c1", docs);
    expect(unified).toHaveLength(2);
    expect(unified[0]).toMatchObject({
      id: "m1",
      chatId: "c1",
      role: "user",
      content: "hello",
      source: "convex",
    });
    expect(unified[1].id).toBe("m2");
    expect(unified[1].content).toBe("");
    expect(unified[1].chatId).toBe("c1");
  });
});
