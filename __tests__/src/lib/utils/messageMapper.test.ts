import { describe, it, expect } from "vitest";
import { mapMessagesToLocal } from "../../../../src/lib/utils/messageMapper";
import {
  createLocalUIMessage,
  type ContextReference,
} from "../../../../src/lib/types/message";

describe("mapMessagesToLocal (sources/searchResults)", () => {
  it("synthesizes searchResults from contextReferences when searchResults is empty", () => {
    const contextReferences: ContextReference[] = [
      {
        contextId: "ctx-1",
        type: "scraped_page",
        url: "https://example.com/path",
        title: "Example Source",
        timestamp: 123,
        relevanceScore: 0.9,
      },
      {
        contextId: "ctx-2",
        type: "search_result",
        url: "https://docs.example.com/guide",
        // Intentionally omit title to verify hostname inference path
        timestamp: 456,
        relevanceScore: 0.6,
      },
    ];

    const msg = createLocalUIMessage({
      id: "m1",
      chatId: "c1",
      role: "assistant",
      content: "Answer with citations [example.com]",
      searchResults: [],
      sources: [],
    });

    // Simulate persisted agent workflow messages: contextReferences present,
    // but searchResults may be stored as [].
    msg.contextReferences = contextReferences;
    msg.searchResults = [];

    const [mapped] = mapMessagesToLocal([msg]);

    expect(mapped.searchResults).toBeDefined();
    expect(mapped.searchResults?.length).toBe(2);
    expect(mapped.searchResults?.[0]?.url).toBe("https://example.com/path");
    expect(mapped.searchResults?.[0]?.title).toBe("Example Source");
    // Title inferred from hostname when missing
    expect(mapped.searchResults?.[1]?.title).toBe("docs.example.com");
  });

  it("prefers explicit non-empty searchResults over contextReferences", () => {
    const contextReferences: ContextReference[] = [
      {
        contextId: "ctx-1",
        type: "scraped_page",
        url: "https://ignored.example.com",
        title: "Ignored",
        timestamp: 123,
      },
    ];

    const msg = createLocalUIMessage({
      id: "m1",
      chatId: "c1",
      role: "assistant",
      content: "Answer",
      searchResults: [
        {
          title: "Preferred",
          url: "https://preferred.example.com",
          snippet: "",
          relevanceScore: 0.75,
        },
      ],
      sources: [],
    });

    msg.contextReferences = contextReferences;

    const [mapped] = mapMessagesToLocal([msg]);

    expect(mapped.searchResults?.length).toBe(1);
    expect(mapped.searchResults?.[0]?.url).toBe(
      "https://preferred.example.com",
    );
    expect(mapped.searchResults?.[0]?.title).toBe("Preferred");
  });
});
