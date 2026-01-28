import { describe, expect, it } from "vitest";
import { formatSseEvent } from "../../../convex/http/utils";

describe("formatSseEvent", () => {
  it("serializes data as an SSE data line", () => {
    const payload = { type: "content", delta: "hello" };
    const formatted = formatSseEvent(payload);
    expect(formatted).toBe(`data: ${JSON.stringify(payload)}\n\n`);
  });

  it("handles primitive payloads", () => {
    expect(formatSseEvent("ping")).toBe(`data: ${JSON.stringify("ping")}\n\n`);
    expect(formatSseEvent(123)).toBe(`data: ${JSON.stringify(123)}\n\n`);
  });
});
