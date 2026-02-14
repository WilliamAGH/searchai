import { describe, it, expect } from "vitest";
import { validateImageStorageIds } from "../../../convex/http/routes/aiAgent_utils";

/**
 * Valid Convex IDs are alphanumeric strings (case-insensitive) that don't
 * start with local_, chat_, or msg_ prefixes.
 */
const VALID_ID = "k57a3test1234567890abcdefgh";
const VALID_IDS = [VALID_ID, "j9b2cxyz0987654321fedcba"];

describe("validateImageStorageIds", () => {
  it("returns ok with undefined for undefined input", () => {
    expect(validateImageStorageIds(undefined)).toEqual({
      ok: true,
      ids: undefined,
    });
  });

  it("returns ok with undefined for null input", () => {
    expect(validateImageStorageIds(null)).toEqual({
      ok: true,
      ids: undefined,
    });
  });

  it("returns ok with undefined for empty array", () => {
    expect(validateImageStorageIds([])).toEqual({
      ok: true,
      ids: undefined,
    });
  });

  it("rejects non-array input (string)", () => {
    expect(validateImageStorageIds("not-an-array")).toEqual({
      ok: false,
      error: "imageStorageIds must be an array",
    });
  });

  it("rejects non-array input (object)", () => {
    expect(validateImageStorageIds({ storageId: "abc" })).toEqual({
      ok: false,
      error: "imageStorageIds must be an array",
    });
  });

  it("rejects arrays exceeding max length (4)", () => {
    const ids = Array.from({ length: 5 }, (_, i) => `abc${i}def${i}`);
    expect(validateImageStorageIds(ids)).toEqual({
      ok: false,
      error: "imageStorageIds exceeds maximum of 4",
    });
  });

  it("rejects non-string items", () => {
    expect(validateImageStorageIds([123])).toEqual({
      ok: false,
      error: "imageStorageIds items must be strings",
    });
  });

  it("rejects IDs with invalid format (contains hyphens)", () => {
    expect(validateImageStorageIds(["not-a-valid-convex-id"])).toEqual({
      ok: false,
      error: "imageStorageIds contains an invalid ID",
    });
  });

  it("rejects IDs with local_ prefix", () => {
    expect(validateImageStorageIds(["local_abc123"])).toEqual({
      ok: false,
      error: "imageStorageIds contains an invalid ID",
    });
  });

  it("accepts valid alphanumeric IDs", () => {
    const result = validateImageStorageIds(VALID_IDS);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ids).toHaveLength(2);
    }
  });

  it("accepts a single valid ID", () => {
    const result = validateImageStorageIds([VALID_ID]);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ids).toHaveLength(1);
    }
  });

  it("accepts exactly 4 valid IDs (at limit)", () => {
    const ids = Array.from({ length: 4 }, (_, i) => `abc${i}defgh`);
    const result = validateImageStorageIds(ids);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.ids).toHaveLength(4);
    }
  });
});
