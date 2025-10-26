import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { corsHeadersForRequest } from "../../convex/http/utils";

const OLD = { ...process.env };

function makeRequest(origin: string | null, acrh?: string) {
  const headers = new Headers();
  if (origin !== null) headers.set("Origin", origin);
  if (acrh) headers.set("Access-Control-Request-Headers", acrh);
  return new Request("https://example.com/api", { headers });
}

describe("corsHeadersForRequest", () => {
  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.CONVEX_ALLOWED_ORIGINS;
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("allows all origins by default when allow-list is unset", () => {
    const req = makeRequest("https://site-a.test", "X-Custom");
    const headers = corsHeadersForRequest(req, "GET, POST");
    expect(headers["Access-Control-Allow-Origin"]).toBe("*");
    expect(headers["Access-Control-Allow-Methods"]).toBe("GET, POST");
    expect(headers["Access-Control-Allow-Headers"]).toBe("X-Custom");
  });

  it("echoes origin when in allow-list", () => {
    process.env.CONVEX_ALLOWED_ORIGINS =
      "https://site-a.test, https://site-b.test";
    const req = makeRequest("https://site-b.test");
    const headers = corsHeadersForRequest(req, "GET");
    expect(headers["Access-Control-Allow-Origin"]).toBe("https://site-b.test");
  });

  it("returns 'null' when origin not in allow-list", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "https://site-a.test";
    const req = makeRequest("https://evil.test");
    const headers = corsHeadersForRequest(req, "GET");
    expect(headers["Access-Control-Allow-Origin"]).toBe("null");
  });
});
