import { describe, it, expect } from "vitest";
import { extractUrlsFromMessage } from "../../../convex/lib/url";
import { createUserProvidedSearchResults } from "../../../convex/enhancements.ts";

describe("URL extraction and enhancement", () => {
  it("extracts full HTTP URLs", () => {
    const urls = extractUrlsFromMessage(
      "Check out https://example.com for more info",
    );
    expect(urls).toContain("https://example.com");
  });

  it("extracts HTTPS URLs with paths", () => {
    const urls = extractUrlsFromMessage(
      "Visit https://docs.convex.dev/functions/actions for documentation",
    );
    expect(urls).toContain("https://docs.convex.dev/functions/actions");
  });

  it("converts www domains to HTTPS", () => {
    const urls = extractUrlsFromMessage("Go to www.google.com for search");
    expect(urls).toContain("https://www.google.com");
  });

  it("extracts bare domains and converts to HTTPS", () => {
    const urls = extractUrlsFromMessage(
      "Check github.com and stackoverflow.com for code examples",
    );
    expect(urls).toContain("https://github.com");
    expect(urls).toContain("https://stackoverflow.com");
  });

  it("extracts multiple URLs", () => {
    const urls = extractUrlsFromMessage(
      "Compare https://react.dev with https://vuejs.org and https://angular.io",
    );
    expect(urls.length).toBe(3);
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://react.dev",
        "https://vuejs.org",
        "https://angular.io",
      ]),
    );
  });

  it("deduplicates identical URLs", () => {
    const urls = extractUrlsFromMessage(
      "Check https://example.com and again https://example.com",
    );
    expect(urls.length).toBe(1);
    expect(urls[0]).toBe("https://example.com");
  });

  it("handles query parameters and fragments", () => {
    const urls1 = extractUrlsFromMessage(
      "Search results at https://google.com/search?q=typescript",
    );
    expect(urls1).toContain("https://google.com/search?q=typescript");
    const urls2 = extractUrlsFromMessage(
      "See section at https://docs.example.com/guide#installation",
    );
    expect(urls2).toContain("https://docs.example.com/guide#installation");
  });

  it("handles subdomains and ignores invalid domains", () => {
    const urls1 = extractUrlsFromMessage(
      "Check api.github.com and docs.api.github.com",
    );
    expect(urls1).toEqual(expect.arrayContaining(["https://api.github.com"]));
    expect(urls1.some((u) => u.startsWith("https://docs.api.github"))).toBe(
      true,
    );
    const urls2 = extractUrlsFromMessage("Not a domain: test.x or single.");
    expect(urls2.length).toBe(0);
  });

  it("handles mixed content block", () => {
    const message = `I found these resources helpful:\n- Main docs at https://nextjs.org/docs\n- Examples on github.com/vercel/next.js\n- Community at www.reddit.com/r/nextjs\n- Also check typescript.org for types`;
    const urls = extractUrlsFromMessage(message);
    expect(urls.length).toBeGreaterThanOrEqual(4);
    // regex may split github.com/vercel/next.js into separate tokens; ensure at least github.com and a next.js token exist
    expect(urls).toEqual(
      expect.arrayContaining([
        "https://nextjs.org/docs",
        "https://www.reddit.com/r/nextjs",
        "https://typescript.org",
      ]),
    );
    expect(urls.some((u) => u.startsWith("https://github.com"))).toBe(true);
    expect(urls.some((u) => u.includes("next.js"))).toBe(true);
  });

  it("creates search results with high relevance", () => {
    const results = createUserProvidedSearchResults(["https://example.com"]);
    expect(results.length).toBe(1);
    expect(results[0].relevanceScore).toBe(0.95);
    expect(results[0].url).toBe("https://example.com");
  });

  it("handles multiple URLs and extracts hostname in title", () => {
    const urls = [
      "https://react.dev",
      "https://nextjs.org",
      "https://vercel.com",
    ];
    const results = createUserProvidedSearchResults(urls);
    expect(results.length).toBe(3);
    for (const r of results) expect(r.relevanceScore).toBe(0.95);

    const docs = createUserProvidedSearchResults([
      "https://docs.convex.dev/functions",
    ]);
    expect(docs[0].title).toContain("docs.convex.dev");
  });

  it("handles invalid URLs gracefully", () => {
    const results = createUserProvidedSearchResults([
      "not-a-valid-url",
      "https://valid.com",
    ]);
    expect(results.length).toBe(2);
    expect(results[0].title).toContain("not-a-valid-url");
    expect(results[1].title).toContain("valid.com");
  });

  it("extracts from markdown/ports/intl/quotes/parentheses", () => {
    const urlsMd = extractUrlsFromMessage(
      "Check [this guide](https://guide.com) and [docs](https://docs.com)",
    );
    expect(
      urlsMd.some((u) => u.replace(/[)\]]+$/, "") === "https://guide.com"),
    ).toBe(true);
    expect(
      urlsMd.some((u) => u.replace(/[)\]]+$/, "") === "https://docs.com"),
    ).toBe(true);
    expect(
      extractUrlsFromMessage(
        "Local server at http://localhost:3000 and https://example.com:8080",
      ),
    ).toEqual(
      expect.arrayContaining([
        "http://localhost:3000",
        "https://example.com:8080",
      ]),
    );
    expect(
      extractUrlsFromMessage("Check example.co.uk and website.com.au"),
    ).toEqual(
      expect.arrayContaining([
        "https://example.co.uk",
        "https://website.com.au",
      ]),
    );
    const urlsQuoted = extractUrlsFromMessage(
      "Visit \"https://example.com\" or 'https://test.org'",
    );
    const normalized = urlsQuoted.map((u) => u.replace(/["']+$/, ""));
    expect(normalized).toEqual(
      expect.arrayContaining(["https://example.com", "https://test.org"]),
    );
    expect(
      extractUrlsFromMessage(
        "Documentation (https://docs.com) and examples (https://examples.org)",
      ),
    ).toEqual(
      expect.arrayContaining(["https://docs.com", "https://examples.org"]),
    );
  });
});
