import { describe, expect, it } from "vitest";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "../../../../src/lib/utils/favicon";

function isSvgDataUrl(value: string | null): value is string {
  return typeof value === "string" && value.startsWith("data:image/svg+xml,");
}

describe("favicon URL parsing", () => {
  it("parses scheme-less URLs safely", () => {
    const input = "chp.ca.gov/programs-services/programs/child-safety-seats/";
    const icon = getFaviconUrl(input);

    expect(getSafeHostname(input)).toBe("chp.ca.gov");
    expect(getDomainFromUrl(input)).toBe("chp.ca.gov");
    expect(isSvgDataUrl(icon)).toBe(true);
  });

  it("normalizes www prefix for domain display", () => {
    const input = "https://www.ots.ca.gov/child-passenger-safety/";
    expect(getDomainFromUrl(input)).toBe("ots.ca.gov");
  });

  it("supports protocol-relative URLs", () => {
    const input = "//docs.example.com/path";
    const icon = getFaviconUrl(input);

    expect(getSafeHostname(input)).toBe("docs.example.com");
    expect(getDomainFromUrl(input)).toBe("docs.example.com");
    expect(isSvgDataUrl(icon)).toBe(true);
  });

  it("produces deterministic favicon icons per canonical domain", () => {
    const withWww = getFaviconUrl("https://www.substack.com/p/example");
    const withoutWww = getFaviconUrl("https://substack.com/p/another");

    expect(isSvgDataUrl(withWww)).toBe(true);
    expect(withWww).toBe(withoutWww);
  });

  it("rejects single-label scheme-less values", () => {
    expect(getSafeHostname("localhost")).toBe("");
    expect(getDomainFromUrl("localhost")).toBe("");
    expect(getFaviconUrl("localhost")).toBeNull();
  });

  it("returns empty hostname for invalid URL inputs", () => {
    expect(getSafeHostname("not a url!!!")).toBe("");
    expect(getDomainFromUrl("not a url!!!")).toBe("");
    expect(getFaviconUrl("not a url!!!")).toBeNull();
  });
});
