#!/usr/bin/env node
/**
 * Comprehensive test suite for URL extraction and scraping functionality
 */

import {
  extractUrlsFromMessage,
  createUserProvidedSearchResults,
} from "../convex/enhancements.js";

// Test runner
function test(name, fn) {
  try {
    fn();
    console.info(`✅ ${name}`);
  } catch (e) {
    console.error(`❌ ${name}`);
    console.error(`   ${e.message}`);
    process.exit(1);
  }
}

function assert(condition, message) {
  if (!condition) {
    throw new Error(message || "Assertion failed");
  }
}

// Unused helper kept for potential future use
// function assertDeepEqual(actual, expected, message) {
//   const actualStr = JSON.stringify(actual, null, 2);
//   const expectedStr = JSON.stringify(expected, null, 2);
//   if (actualStr !== expectedStr) {
//     throw new Error(
//       `${message || "Values not equal"}\nExpected:\n${expectedStr}\nActual:\n${actualStr}`,
//     );
//   }
// }

console.info("Testing URL extraction and enhancement functionality...\n");
console.info("=".repeat(60));

// Test URL extraction from messages
test("Should extract full HTTP URLs", () => {
  const message = "Check out https://example.com for more info";
  const urls = extractUrlsFromMessage(message);
  assert(urls.includes("https://example.com"), "Should extract https URL");
});

test("Should extract HTTPS URLs with paths", () => {
  const message =
    "Visit https://docs.convex.dev/functions/actions for documentation";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://docs.convex.dev/functions/actions"),
    "Should extract full URL with path",
  );
});

test("Should extract www domains and convert to HTTPS", () => {
  const message = "Go to www.google.com for search";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://www.google.com"),
    "Should convert www to https",
  );
});

test("Should extract bare domains and convert to HTTPS", () => {
  const message = "Check github.com and stackoverflow.com for code examples";
  const urls = extractUrlsFromMessage(message);
  assert(urls.includes("https://github.com"), "Should extract github.com");
  assert(
    urls.includes("https://stackoverflow.com"),
    "Should extract stackoverflow.com",
  );
});

test("Should extract multiple URLs from one message", () => {
  const message =
    "Compare https://react.dev with https://vuejs.org and https://angular.io";
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 3, "Should extract all 3 URLs");
  assert(urls.includes("https://react.dev"), "Should include React");
  assert(urls.includes("https://vuejs.org"), "Should include Vue");
  assert(urls.includes("https://angular.io"), "Should include Angular");
});

test("Should deduplicate identical URLs", () => {
  const message = "Check https://example.com and again https://example.com";
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 1, "Should deduplicate URLs");
  assert(urls[0] === "https://example.com", "Should keep the URL");
});

test("Should handle URLs with query parameters", () => {
  const message = "Search results at https://google.com/search?q=typescript";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://google.com/search?q=typescript"),
    "Should preserve query params",
  );
});

test("Should handle URLs with fragments", () => {
  const message = "See section at https://docs.example.com/guide#installation";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://docs.example.com/guide#installation"),
    "Should preserve fragments",
  );
});

test("Should handle subdomains correctly", () => {
  const message = "Check api.github.com and docs.api.github.com";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://api.github.com"),
    "Should handle single subdomain",
  );
  assert(
    urls.includes("https://docs.api.github.com"),
    "Should handle multiple subdomains",
  );
});

test("Should ignore invalid domains", () => {
  const message = "Not a domain: test.x or single.";
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 0, "Should not extract invalid domains");
});

test("Should handle mixed content", () => {
  const message = `
    I found these resources helpful:
    - Main docs at https://nextjs.org/docs
    - Examples on github.com/vercel/next.js
    - Community at www.reddit.com/r/nextjs
    - Also check typescript.org for types
  `;
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 4, "Should extract all 4 URLs");
  assert(
    urls.includes("https://nextjs.org/docs"),
    "Should include Next.js docs",
  );
  assert(
    urls.includes("https://github.com/vercel/next.js"),
    "Should handle path in domain",
  );
  assert(
    urls.includes("https://www.reddit.com/r/nextjs"),
    "Should include Reddit",
  );
  assert(urls.includes("https://typescript.org"), "Should include TypeScript");
});

// Test search result creation
console.info("\n" + "=".repeat(60));
console.info("Testing search result creation from URLs...\n");

test("Should create search results with high relevance", () => {
  const urls = ["https://example.com"];
  const results = createUserProvidedSearchResults(urls);
  assert(results.length === 1, "Should create one result");
  assert(
    results[0].relevanceScore === 0.95,
    "Should have high relevance score",
  );
  assert(results[0].url === "https://example.com", "Should preserve URL");
});

test("Should handle multiple URLs", () => {
  const urls = [
    "https://react.dev",
    "https://nextjs.org",
    "https://vercel.com",
  ];
  const results = createUserProvidedSearchResults(urls);
  assert(results.length === 3, "Should create three results");
  results.forEach((result) => {
    assert(result.relevanceScore === 0.95, "All should have high relevance");
    assert(result.snippet.includes("user"), "Should indicate user-provided");
  });
});

test("Should extract hostname for title", () => {
  const urls = ["https://docs.convex.dev/functions"];
  const results = createUserProvidedSearchResults(urls);
  assert(
    results[0].title.includes("docs.convex.dev"),
    "Title should include hostname",
  );
});

test("Should handle invalid URLs gracefully", () => {
  const urls = ["not-a-valid-url", "https://valid.com"];
  const results = createUserProvidedSearchResults(urls);
  assert(results.length === 2, "Should handle both URLs");
  assert(
    results[0].title.includes("not-a-valid-url"),
    "Should include invalid URL in title",
  );
  assert(
    results[1].title.includes("valid.com"),
    "Should parse valid URL correctly",
  );
});

// Edge cases and comprehensive scenarios
console.info("\n" + "=".repeat(60));
console.info("Testing edge cases and real-world scenarios...\n");

test("Should handle URLs in markdown links", () => {
  const message =
    "Check [this guide](https://guide.com) and [docs](https://docs.com)";
  const urls = extractUrlsFromMessage(message);
  assert(urls.includes("https://guide.com"), "Should extract from markdown");
  assert(urls.includes("https://docs.com"), "Should extract from markdown");
});

test("Should handle URLs with ports", () => {
  const message =
    "Local server at http://localhost:3000 and https://example.com:8080";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("http://localhost:3000"),
    "Should preserve localhost with port",
  );
  assert(urls.includes("https://example.com:8080"), "Should preserve port");
});

test("Should handle international domains", () => {
  const message = "Check example.co.uk and website.com.au";
  const urls = extractUrlsFromMessage(message);
  assert(urls.includes("https://example.co.uk"), "Should handle .co.uk");
  assert(urls.includes("https://website.com.au"), "Should handle .com.au");
});

test("Should handle URLs in quotes", () => {
  const message = "Visit \"https://example.com\" or 'https://test.org'";
  const urls = extractUrlsFromMessage(message);
  assert(
    urls.includes("https://example.com"),
    "Should extract from double quotes",
  );
  assert(
    urls.includes("https://test.org"),
    "Should extract from single quotes",
  );
});

test("Should handle URLs in parentheses", () => {
  const message =
    "Documentation (https://docs.com) and examples (https://examples.org)";
  const urls = extractUrlsFromMessage(message);
  assert(urls.includes("https://docs.com"), "Should extract from parentheses");
  assert(
    urls.includes("https://examples.org"),
    "Should extract from parentheses",
  );
});

// Real-world use cases
console.info("\n" + "=".repeat(60));
console.info("Testing real-world use cases...\n");

test("User asking about specific documentation", () => {
  const message =
    "What does https://react.dev/learn/thinking-in-react say about component design?";
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 1, "Should extract documentation URL");
  assert(
    urls[0] === "https://react.dev/learn/thinking-in-react",
    "Should preserve full path",
  );

  const results = createUserProvidedSearchResults(urls);
  assert(
    results[0].relevanceScore === 0.95,
    "Should prioritize user-provided URL",
  );
});

test("User comparing multiple resources", () => {
  const message =
    "Compare the approaches in nextjs.org/docs/routing with remix.run/docs/en/main/guides/routing";
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 2, "Should extract both framework docs");

  const results = createUserProvidedSearchResults(urls);
  assert(
    results.every((r) => r.relevanceScore === 0.95),
    "Both should be high priority",
  );
});

test("User providing context with mixed URLs", () => {
  const message = `
    I'm following the tutorial at https://www.typescriptlang.org/docs/handbook/intro.html
    but I'm stuck on the generics section. I also checked stackoverflow.com/questions/12345
    and found a related discussion on reddit.com/r/typescript but still confused.
  `;
  const urls = extractUrlsFromMessage(message);
  assert(urls.length === 3, "Should extract all three sources");
  assert(
    urls.includes("https://www.typescriptlang.org/docs/handbook/intro.html"),
    "Should include TS docs",
  );
  assert(
    urls.includes("https://stackoverflow.com/questions/12345"),
    "Should include SO question",
  );
  assert(
    urls.includes("https://reddit.com/r/typescript"),
    "Should include Reddit",
  );
});

// Summary
console.info("\n" + "=".repeat(60));
console.info("✅ All URL extraction and enhancement tests passed!");
console.info("=".repeat(60));

// Performance check
console.info("\nPerformance check:");
const perfMessage =
  "Check ".repeat(100) + "https://example.com " + "and test.com ".repeat(100);
const startTime = Date.now();
const perfUrls = extractUrlsFromMessage(perfMessage);
const endTime = Date.now();
console.info(
  `Extracted ${perfUrls.length} URLs from large message in ${endTime - startTime}ms`,
);

console.info("\n🎉 URL extraction system is battle-ready!");
