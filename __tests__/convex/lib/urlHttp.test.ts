import { describe, expect, it } from "vitest";
import { normalizeHttpUrl } from "../../../convex/lib/urlHttp";

describe("normalizeHttpUrl", () => {
  describe("non-string input", () => {
    it("returns undefined for undefined", () => {
      expect(normalizeHttpUrl(undefined)).toBeUndefined();
    });

    it("returns undefined for null", () => {
      expect(normalizeHttpUrl(null)).toBeUndefined();
    });

    it("returns undefined for number", () => {
      expect(normalizeHttpUrl(42)).toBeUndefined();
    });

    it("returns undefined for boolean", () => {
      expect(normalizeHttpUrl(true)).toBeUndefined();
    });
  });

  describe("empty / whitespace strings", () => {
    it("returns undefined for empty string", () => {
      expect(normalizeHttpUrl("")).toBeUndefined();
    });

    it("returns undefined for whitespace-only string", () => {
      expect(normalizeHttpUrl("   ")).toBeUndefined();
    });
  });

  describe("valid http/https URLs", () => {
    it("returns canonicalized https URL", () => {
      expect(normalizeHttpUrl("https://example.com")).toBe(
        "https://example.com/",
      );
    });

    it("returns canonicalized http URL", () => {
      expect(normalizeHttpUrl("http://example.com/page")).toBe(
        "http://example.com/page",
      );
    });

    it("canonicalizes URL via URL.toString()", () => {
      // URL constructor normalizes encoding, trailing slash, etc.
      expect(normalizeHttpUrl("HTTPS://EXAMPLE.COM")).toBe(
        "https://example.com/",
      );
    });

    it("preserves query parameters", () => {
      const url = "https://example.com/search?q=test&page=1";
      expect(normalizeHttpUrl(url)).toBe(url);
    });

    it("trims surrounding whitespace", () => {
      expect(normalizeHttpUrl("  https://example.com/  ")).toBe(
        "https://example.com/",
      );
    });
  });

  describe("bare domain auto-prefixing", () => {
    it("adds https:// to bare domain with dot", () => {
      expect(normalizeHttpUrl("example.com")).toBe("https://example.com/");
    });

    it("adds https:// to bare domain with path", () => {
      expect(normalizeHttpUrl("example.com/page")).toBe(
        "https://example.com/page",
      );
    });

    it("adds https:// to subdomain", () => {
      expect(normalizeHttpUrl("sub.example.com")).toBe(
        "https://sub.example.com/",
      );
    });
  });

  describe("non-http schemes rejected", () => {
    it("returns undefined for javascript: URL", () => {
      expect(normalizeHttpUrl("javascript:alert(1)")).toBeUndefined();
    });

    it("returns undefined for ftp: URL", () => {
      expect(normalizeHttpUrl("ftp://example.com")).toBeUndefined();
    });

    it("returns undefined for data: URL", () => {
      expect(normalizeHttpUrl("data:text/html,<h1>hi</h1>")).toBeUndefined();
    });
  });

  describe("unparseable input", () => {
    it("returns undefined for string without dot and no scheme", () => {
      expect(normalizeHttpUrl("not-a-url")).toBeUndefined();
    });
  });

  describe("maxLength enforcement", () => {
    it("truncates output to maxLength", () => {
      const longPath = "a".repeat(3000);
      const result = normalizeHttpUrl(`https://example.com/${longPath}`, 2048);
      expect(result).toBeDefined();
      expect(result?.length).toBeLessThanOrEqual(2048);
    });

    it("does not truncate when within limit", () => {
      const result = normalizeHttpUrl("https://example.com/short", 2048);
      expect(result).toBe("https://example.com/short");
    });

    it("returns full URL when maxLength is 0 (no limit)", () => {
      const result = normalizeHttpUrl("https://example.com/path", 0);
      expect(result).toBe("https://example.com/path");
    });
  });
});
