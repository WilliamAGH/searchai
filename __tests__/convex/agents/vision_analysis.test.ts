import { describe, expect, it } from "vitest";

import { CONTENT_LIMITS } from "../../../convex/lib/constants/cache";
import { buildVisionAnalysisUserPromptText } from "../../../convex/agents/vision_analysis";

describe("buildVisionAnalysisUserPromptText", () => {
  it("truncates long userQuery to VISION_USER_QUERY_CONTEXT_CHARS", () => {
    const userQuery = "Q".repeat(
      CONTENT_LIMITS.VISION_USER_QUERY_CONTEXT_CHARS + 50,
    );
    const text = buildVisionAnalysisUserPromptText(userQuery);

    const match = text.match(/context: "(.+)"$/);
    expect(match).not.toBeNull();
    if (!match) throw new Error("Expected context capture");

    const context = match[1] ?? "";
    expect(context.length).toBeLessThanOrEqual(
      CONTENT_LIMITS.VISION_USER_QUERY_CONTEXT_CHARS + 3,
    );
    expect(context.endsWith("...")).toBe(true);
  });

  it("does not truncate short userQuery", () => {
    const userQuery = "Short question";
    const text = buildVisionAnalysisUserPromptText(userQuery);
    expect(text).toContain(`"${userQuery}"`);
    expect(text.endsWith("...")).toBe(false);
  });
});
