import { describe, expect, it } from "vitest";
import {
  hasLegacyWebResearchSourceFields,
  resolveWebResearchSourcesFromMessage,
} from "../../../convex/chats/webResearchSourcesResolver";

describe("webResearchSourcesResolver", () => {
  it("derives canonical sources from legacy contextReferences", () => {
    const sources = resolveWebResearchSourcesFromMessage({
      _id: "msg_1",
      timestamp: 100,
      contextReferences: [
        {
          contextId: "ctx_1",
          type: "scraped_page",
          url: "https://example.com/a",
          title: "Example A",
          timestamp: 101,
          relevanceScore: 0.9,
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      contextId: "ctx_1",
      type: "scraped_page",
      url: "https://example.com/a",
      title: "Example A",
      timestamp: 101,
      relevanceScore: 0.9,
    });
  });

  it("derives canonical sources from legacy searchResults", () => {
    const sources = resolveWebResearchSourcesFromMessage({
      _id: "msg_2",
      timestamp: 200,
      searchResults: [
        {
          kind: "search_result",
          url: "https://example.com/result",
          title: "Result",
          relevanceScore: 0.7,
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      type: "search_result",
      url: "https://example.com/result",
      title: "Result",
      timestamp: 200,
      relevanceScore: 0.7,
    });
  });

  it("normalizes domain-only legacy sources into https URLs", () => {
    const sources = resolveWebResearchSourcesFromMessage({
      _id: "msg_3",
      timestamp: 300,
      sources: ["example.com/path"],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]).toMatchObject({
      type: "search_result",
      url: "https://example.com/path",
      title: "example.com",
      timestamp: 300,
    });
  });

  it("deduplicates matching urls across canonical and legacy fields", () => {
    const sources = resolveWebResearchSourcesFromMessage({
      _id: "msg_4",
      timestamp: 400,
      webResearchSources: [
        {
          contextId: "canonical_1",
          type: "search_result",
          url: "https://www.example.com/page/",
          title: "Canonical",
          timestamp: 401,
        },
      ],
      contextReferences: [
        {
          contextId: "legacy_1",
          type: "search_result",
          url: "https://example.com/page",
          title: "Legacy",
          timestamp: 402,
        },
      ],
    });

    expect(sources).toHaveLength(1);
    expect(sources[0]?.contextId).toBe("canonical_1");
  });

  it("detects presence of legacy source fields", () => {
    expect(
      hasLegacyWebResearchSourceFields({
        searchResults: [],
      }),
    ).toBe(true);

    expect(
      hasLegacyWebResearchSourceFields({
        webResearchSources: [],
      }),
    ).toBe(false);
  });
});
