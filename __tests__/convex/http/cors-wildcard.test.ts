import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { validateOrigin } from "../../../convex/http/cors";

const OLD = { ...process.env };

describe("validateOrigin wildcard matching", () => {
  beforeEach(() => {
    process.env = { ...OLD };
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("matches valid HTTPS subdomain against wildcard", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("https://app.example.com")).toBe(
      "https://app.example.com",
    );
  });

  it("matches exact domain against wildcard (no subdomain)", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("https://example.com")).toBe("https://example.com");
  });

  it("matches HTTP subdomain against wildcard", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("http://dev.example.com")).toBe(
      "http://dev.example.com",
    );
  });

  it("rejects javascript: protocol bypass", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("javascript://x.example.com")).toBeNull();
  });

  it("rejects data: protocol bypass", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("data:text/html,x.example.com")).toBeNull();
  });

  it("rejects non-matching domain", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("https://evil.com")).toBeNull();
  });

  it("rejects domain suffix attack (evil-example.com)", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    // "evil-example.com" ends with "example.com" in string terms but
    // hostname-based matching rejects it because it doesn't end with ".example.com"
    expect(validateOrigin("https://evil-example.com")).toBeNull();
  });

  it("rejects invalid URL format", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "*.example.com";
    expect(validateOrigin("not-a-url")).toBeNull();
  });
});
