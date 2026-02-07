import { describe, it, expect } from "vitest";
import { sanitizeWebResearchSources } from "../../../convex/http/routes/aiAgent";

const baseSource = {
  contextId: "019a122e-c507-7851-99f7-b8f5d7345b40",
  type: "search_result" as const,
  url: "https://example.com/article",
  title: "Example",
};

describe("sanitizeWebResearchSources relevanceScore handling", () => {
  it("passes through valid relevanceScore in [0,1]", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: 0.75 },
    ]);
    expect(result?.[0]?.relevanceScore).toBe(0.75);
  });

  it("clamps relevanceScore > 1 to 1", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: 5.0 },
    ]);
    expect(result?.[0]?.relevanceScore).toBe(1);
  });

  it("clamps negative relevanceScore to 0", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: -0.5 },
    ]);
    expect(result?.[0]?.relevanceScore).toBe(0);
  });

  it("preserves boundary value 0", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: 0 },
    ]);
    expect(result?.[0]?.relevanceScore).toBe(0);
  });

  it("preserves boundary value 1", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: 1 },
    ]);
    expect(result?.[0]?.relevanceScore).toBe(1);
  });

  it("excludes NaN relevanceScore", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: Number.NaN },
    ]);
    expect(result?.[0]?.relevanceScore).toBeUndefined();
  });

  it("excludes non-number relevanceScore", () => {
    const result = sanitizeWebResearchSources([
      { ...baseSource, relevanceScore: "high" },
    ]);
    expect(result?.[0]?.relevanceScore).toBeUndefined();
  });

  it("omits relevanceScore when not provided", () => {
    const result = sanitizeWebResearchSources([baseSource]);
    expect(result?.[0]?.relevanceScore).toBeUndefined();
  });
});
