import { expect, test } from "vitest";
import { normalizeUrlForKey, normalizeUrl } from "./url";

test("normalizeUrl strips hash", () => {
  expect(normalizeUrl("https://example.com/page#section")).toBe(
    "https://example.com/page",
  );
});

test("normalizeUrlForKey handles invalid URLs consistently with fallback", () => {
  // Case 1: Valid URL - hash stripped by normalizeUrl
  expect(normalizeUrlForKey("https://example.com/page#section")).toBe(
    "https://example.com/page",
  );

  // Case 2: Invalid URL - hash is manually stripped in fallback
  expect(normalizeUrlForKey("not-a-url#hash")).toBe("not-a-url");
});

test("normalizeUrlForKey redundant logic check", () => {
  // The feedback claims redundant parsing.
  // normalizeUrlForKey calls normalizeUrl (strips hash) -> returns string
  // Then new URL(normalized) -> normalized already has no hash.
  // Then it proceeds to strip params etc.

  const input = "https://WWW.Example.COM/page/#section?utm_source=tracker";
  // 1. normalizeUrl -> https://www.example.com/page/ (hash stripped)
  // 2. new URL(...)
  // 3. hostname lower/www stripped -> example.com
  // 4. params stripped -> query empty
  // 5. trailing slash stripped -> /page
  // Result: https://example.com/page

  expect(normalizeUrlForKey(input)).toBe("https://example.com/page");
});
