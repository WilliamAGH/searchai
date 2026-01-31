import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { corsResponse } from "../../../convex/http/cors";

const OLD = { ...process.env };

describe("corsResponse", () => {
  beforeEach(() => {
    process.env = { ...OLD };
    delete process.env.CONVEX_ALLOWED_ORIGINS;
  });
  afterEach(() => {
    process.env = { ...OLD };
  });

  it("echoes origin when in allow-list", () => {
    process.env.CONVEX_ALLOWED_ORIGINS =
      "https://site-a.test, https://site-b.test";
    const response = corsResponse("{}", 200, "https://site-b.test");
    expect(response.status).toBe(200);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe(
      "https://site-b.test",
    );
  });

  it("rejects origin not in allow-list", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "https://site-a.test";
    const response = corsResponse("{}", 200, "https://evil.test");
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });

  it("rejects null origin", () => {
    process.env.CONVEX_ALLOWED_ORIGINS = "https://site-a.test";
    const response = corsResponse("{}", 200, "null");
    expect(response.status).toBe(403);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBeNull();
  });
});
