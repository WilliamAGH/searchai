import { describe, expect, it } from "vitest";

import { buildConversationContext } from "../../../convex/agents/helpers_builders";
import { CONTENT_LIMITS } from "../../../convex/lib/constants/cache";

describe("buildConversationContext", () => {
  it("keeps newest turns within MAX_CONTEXT_CHARS", () => {
    const filler = "x".repeat(600);
    const messages = Array.from(
      { length: CONTENT_LIMITS.MAX_CONTEXT_MESSAGES },
      (_, i) => ({
        role: "user" as const,
        content: `msg${i} ${filler}`,
      }),
    );

    const out = buildConversationContext(messages);

    expect(out.length).toBeLessThanOrEqual(CONTENT_LIMITS.MAX_CONTEXT_CHARS);
    expect(out).toContain(`msg${messages.length - 1}`);
    expect(out).not.toContain("msg0");
  });

  it("truncates the newest block if it alone exceeds the budget", () => {
    const messages = [
      {
        role: "user" as const,
        content: "A".repeat(CONTENT_LIMITS.MAX_CONTEXT_CHARS * 2),
      },
    ];

    const out = buildConversationContext(messages);

    expect(out.length).toBeLessThanOrEqual(CONTENT_LIMITS.MAX_CONTEXT_CHARS);
    expect(out.startsWith("User: ")).toBe(true);
    expect(out.endsWith("...")).toBe(true);
  });

  it("truncates imageAnalysis per message to MAX_IMAGE_ANALYSIS_CONTEXT_CHARS", () => {
    const analysis = "A".repeat(
      CONTENT_LIMITS.MAX_IMAGE_ANALYSIS_CONTEXT_CHARS + 500,
    );
    const messages = [
      {
        role: "user" as const,
        content: "Here is an image",
        imageAnalysis: analysis,
      },
    ];

    const out = buildConversationContext(messages);

    const match = out.match(/\[Image context[^\]]*: ([^\]]+)\]/);
    expect(match).not.toBeNull();
    const included = match?.[1] ?? "";

    expect(included.length).toBeLessThanOrEqual(
      CONTENT_LIMITS.MAX_IMAGE_ANALYSIS_CONTEXT_CHARS,
    );
    expect(included.endsWith("...")).toBe(true);
  });
});
