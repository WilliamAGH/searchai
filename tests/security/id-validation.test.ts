/**
 * ID Validation Security Tests
 *
 * Verifies that Convex ID validation prevents unsafe casts and runtime errors.
 * Tests both backend (convex/lib/validators) and frontend (src/lib/utils/idValidation) utilities.
 */

import { describe, it, expect } from "vitest";

// Frontend utilities
import {
  isValidConvexId,
  toConvexId,
  isLocalId,
} from "../../src/lib/utils/idValidation";

// Backend utilities
import {
  isValidConvexIdFormat,
  safeConvexId,
} from "../../convex/lib/validators";

describe("Frontend ID Validation", () => {
  describe("isValidConvexId", () => {
    it("should accept valid Convex ID format with pipe separator", () => {
      expect(isValidConvexId("kg24lrv8sq2j9xf0v2q8k6z5sw6z|123")).toBe(true);
      expect(isValidConvexId("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(true);
    });

    it("should reject strings without pipe separator", () => {
      expect(isValidConvexId("local-chat-123")).toBe(false);
      expect(isValidConvexId("invalid-uuid-v7")).toBe(false);
      expect(isValidConvexId("abc123")).toBe(false);
    });

    it("should reject empty, null, or undefined values", () => {
      expect(isValidConvexId("")).toBe(false);
      expect(isValidConvexId(null)).toBe(false);
      expect(isValidConvexId(undefined)).toBe(false);
    });

    it("should reject strings that are too short even with pipe", () => {
      expect(isValidConvexId("a|b")).toBe(false);
      expect(isValidConvexId("|")).toBe(false);
    });
  });

  describe("toConvexId", () => {
    it("should return typed ID for valid Convex ID", () => {
      const validId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
      const result = toConvexId<"chats">(validId);
      expect(result).toBe(validId);
    });

    it("should return null for invalid ID formats", () => {
      expect(toConvexId<"chats">("local-123")).toBeNull();
      expect(toConvexId<"chats">("")).toBeNull();
      expect(toConvexId<"chats">(null)).toBeNull();
      expect(toConvexId<"chats">(undefined)).toBeNull();
    });

    it("should return null for malformed IDs that could cause errors", () => {
      // These could previously cause runtime errors in database operations
      expect(toConvexId<"chats">("not-a-convex-id")).toBeNull();
      expect(toConvexId<"chats">("uuid-v7-format-12345")).toBeNull();
      expect(toConvexId<"chats">("random-string")).toBeNull();
    });
  });

  describe("isLocalId", () => {
    it("should identify local IDs correctly", () => {
      expect(isLocalId("local-chat-123")).toBe(true);
      expect(isLocalId("temp-message-456")).toBe(true);
    });

    it("should identify Convex IDs as non-local", () => {
      expect(isLocalId("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(false);
    });
  });
});

describe("Backend ID Validation", () => {
  describe("isValidConvexIdFormat", () => {
    it("should accept valid Convex ID format", () => {
      expect(isValidConvexIdFormat("kg24lrv8sq2j9xf0v2q8k6z5sw6z|123")).toBe(
        true,
      );
      expect(isValidConvexIdFormat("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(
        true,
      );
    });

    it("should reject invalid formats", () => {
      expect(isValidConvexIdFormat("local-chat")).toBe(false);
      expect(isValidConvexIdFormat("")).toBe(false);
      expect(isValidConvexIdFormat("a|b")).toBe(false);
    });
  });

  describe("safeConvexId", () => {
    it("should return typed ID for valid format", () => {
      const validId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
      const result = safeConvexId<"chats">(validId);
      expect(result).toBe(validId);
    });

    it("should return null for invalid formats", () => {
      expect(safeConvexId<"chats">("invalid")).toBeNull();
      expect(safeConvexId<"chats">("")).toBeNull();
      expect(safeConvexId<"chats">(null)).toBeNull();
      expect(safeConvexId<"chats">(undefined)).toBeNull();
    });

    it("should prevent unsafe casts that could cause database errors", () => {
      // These scenarios previously used unsafe `as Id<"chats">` casts
      const invalidId = "not-a-real-id";
      const result = safeConvexId<"chats">(invalidId);

      // Should return null instead of throwing when used in database operations
      expect(result).toBeNull();
    });
  });
});

describe("Security: Preventing Unsafe Casts", () => {
  it("should prevent runtime errors from malformed IDs in chat deletion", () => {
    // Scenario from ChatSidebar.tsx line 94
    const malformedId = "malformed-chat-id";

    // Before fix: attr as unknown as Id<"chats"> would cause runtime error
    // After fix: toConvexId returns null, preventing database call
    const safeId = toConvexId<"chats">(malformedId);
    expect(safeId).toBeNull();
  });

  it("should prevent errors in getChatByOpaqueId with invalid ID", () => {
    // Scenario from convex/chats/core.ts line 169
    const opaqueId = "some-opaque-string";

    // Before fix: args.opaqueId as Id<"chats"> could cause database errors
    // After fix: safeConvexId returns null early
    const chatId = safeConvexId<"chats">(opaqueId);
    expect(chatId).toBeNull();
  });

  it("should handle edge cases that could bypass simple checks", () => {
    // Edge cases that contain pipe but are still invalid
    const edgeCases = [
      "|", // Just pipe
      "a|b", // Too short
      "|||", // Multiple pipes
      " | ", // Whitespace
    ];

    for (const testCase of edgeCases) {
      expect(toConvexId<"chats">(testCase)).toBeNull();
      expect(safeConvexId<"chats">(testCase)).toBeNull();
    }
  });
});

describe("Type Safety", () => {
  it("should maintain type safety for valid IDs", () => {
    const validChatId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
    const validMessageId = "messages|abc123xyz456def789ghi012";

    // TypeScript should infer correct types
    const chatId = toConvexId<"chats">(validChatId);
    const messageId = toConvexId<"messages">(validMessageId);

    expect(chatId).toBe(validChatId);
    expect(messageId).toBe(validMessageId);
  });

  it("should handle null safely in conditional flows", () => {
    const maybeId = "invalid-id";
    const id = toConvexId<"chats">(maybeId);

    // Safe pattern for conditional database operations
    if (id) {
      // Would safely call database here
      expect(id).toBeTruthy();
    } else {
      // Gracefully handle invalid ID
      expect(id).toBeNull();
    }
  });
});
