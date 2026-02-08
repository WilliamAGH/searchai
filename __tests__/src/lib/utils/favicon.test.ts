import { describe, expect, it } from "vitest";
import {
  getDomainFromUrl,
  getFaviconUrl,
  getSafeHostname,
} from "../../../../src/lib/utils/favicon";

describe("favicon URL parsing", () => {
  it("parses scheme-less URLs safely", () => {
    const input = "chp.ca.gov/programs-services/programs/child-safety-seats/";

    expect(getSafeHostname(input)).toBe("chp.ca.gov");
    expect(getDomainFromUrl(input)).toBe("chp.ca.gov");
    expect(getFaviconUrl(input)).toBe(
      "https://icons.duckduckgo.com/ip3/chp.ca.gov.ico",
    );
  });

  it("normalizes www prefix for domain display", () => {
    const input = "https://www.ots.ca.gov/child-passenger-safety/";
    expect(getDomainFromUrl(input)).toBe("ots.ca.gov");
  });

  it("supports protocol-relative URLs", () => {
    const input = "//docs.example.com/path";
    expect(getSafeHostname(input)).toBe("docs.example.com");
    expect(getDomainFromUrl(input)).toBe("docs.example.com");
    expect(getFaviconUrl(input)).toBe(
      "https://icons.duckduckgo.com/ip3/docs.example.com.ico",
    );
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
