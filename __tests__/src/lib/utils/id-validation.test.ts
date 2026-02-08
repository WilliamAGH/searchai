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
} from "../../../../src/lib/utils/idValidation";

// Backend utilities
import {
  isValidConvexIdFormat,
  safeConvexId,
} from "../../../../convex/lib/validators";

describe("Frontend ID Validation", () => {
  describe("isValidConvexId", () => {
    it("should accept identifiers that are not marked as local", () => {
      expect(isValidConvexId("kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(true);
      expect(isValidConvexId("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(true);
    });

    it("should reject local identifiers", () => {
      expect(isValidConvexId("local_123")).toBe(false);
      expect(isValidConvexId("chat_123")).toBe(false);
      expect(isValidConvexId("msg_456")).toBe(false);
    });

    it("should reject empty, null, or undefined values", () => {
      expect(isValidConvexId("")).toBe(false);
      expect(isValidConvexId(null)).toBe(false);
      expect(isValidConvexId(undefined)).toBe(false);
    });
  });

  describe("toConvexId", () => {
    it("should return typed ID for valid Convex ID", () => {
      const validId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
      const result = toConvexId<"chats">(validId);
      expect(result).toBe("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
    });

    it("should return null for local identifiers", () => {
      expect(toConvexId<"chats">("local_123")).toBeNull();
      expect(toConvexId<"chats">("chat_456")).toBeNull();
      expect(toConvexId<"chats">("msg_777")).toBeNull();
      expect(toConvexId<"chats">("")).toBeNull();
      expect(toConvexId<"chats">(null)).toBeNull();
      expect(toConvexId<"chats">(undefined)).toBeNull();
    });
  });

  describe("isLocalId", () => {
    it("should identify local IDs correctly", () => {
      expect(isLocalId("local_123")).toBe(true);
      expect(isLocalId("msg_456")).toBe(true);
    });

    it("should identify Convex IDs as non-local", () => {
      expect(isLocalId("kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(false);
    });
  });
});

describe("Backend ID Validation", () => {
  describe("isValidConvexIdFormat", () => {
    it("should accept identifiers that are not local", () => {
      expect(isValidConvexIdFormat("kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(true);
      expect(isValidConvexIdFormat("chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z")).toBe(
        true,
      );
    });

    it("should reject local identifiers", () => {
      expect(isValidConvexIdFormat("local_123")).toBe(false);
      expect(isValidConvexIdFormat("chat_123")).toBe(false);
      expect(isValidConvexIdFormat("msg_001")).toBe(false);
      expect(isValidConvexIdFormat("")).toBe(false);
    });
  });

  describe("safeConvexId", () => {
    it("should return typed ID for valid format", () => {
      const validId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
      const result = safeConvexId<"chats">(validId);
      expect(result).toBe("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
    });

    it("should return null for local identifiers", () => {
      expect(safeConvexId<"chats">("local_123")).toBeNull();
      expect(safeConvexId<"chats">("chat_999")).toBeNull();
      expect(safeConvexId<"chats">("")).toBeNull();
      expect(safeConvexId<"chats">(null)).toBeNull();
      expect(safeConvexId<"chats">(undefined)).toBeNull();
    });

    it("should allow unknown remote identifiers for further validation", () => {
      const opaqueId = "kg24lrv8sq2j9xf0v2q8k6z5sw6z";
      expect(safeConvexId<"chats">(opaqueId)).toBe(opaqueId);
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

  it("should handle edge cases that could bypass simple checks", () => {
    // Edge cases that contain pipe but are still invalid
    const edgeCases = ["local_", "chat_", "msg_"];

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

    expect(chatId).toBe("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
    expect(messageId).toBe("abc123xyz456def789ghi012");
  });

  it("should handle null safely in conditional flows", () => {
    // For invalid IDs, toConvexId should return null
    const invalidId = "invalid-id";
    const nullResult = toConvexId<"chats">(invalidId);
    expect(nullResult).toBeNull();

    // For valid IDs, it should return the ID (truthy)
    const validId = "chats|kg24lrv8sq2j9xf0v2q8k6z5sw6z";
    const validResult = toConvexId<"chats">(validId);
    expect(validResult).toBeTruthy();
    expect(validResult).toBe("kg24lrv8sq2j9xf0v2q8k6z5sw6z");
  });
});
