// src/lib/utils/__tests__/chatValidation.test.ts
import { describe, it, expect } from "vitest";
import { validateChatContext } from "../../../../src/lib/utils/chatValidation";

describe("validateChatContext", () => {
  it("should detect missing chat ID when messages exist", () => {
    const result = validateChatContext(
      null,
      [{ chatId: "chat_123", role: "user" }],
      [{ id: "chat_123" }],
    );

    expect(result.isValid).toBe(false);
    expect(result.suggestedChatId).toBe("chat_123");
    expect(result.confidence).toBe(0.95);
  });

  it("should detect chat ID mismatch", () => {
    const result = validateChatContext(
      "chat_456",
      [{ chatId: "chat_123", role: "user" }],
      [{ id: "chat_123" }, { id: "chat_456" }],
    );

    expect(result.isValid).toBe(false);
    expect(result.suggestedChatId).toBe("chat_123");
    expect(result.reason).toContain("mismatch");
  });

  it("should detect assistant-first message scenario", () => {
    const result = validateChatContext(
      null,
      [{ chatId: "chat_123", role: "assistant" }],
      [{ id: "chat_123" }],
    );

    expect(result.isValid).toBe(false);
    expect(result.suggestedChatId).toBe("chat_123");
    expect(result.reason).toContain("Assistant sent first");
  });

  it("should validate correct state", () => {
    const result = validateChatContext(
      "chat_123",
      [{ chatId: "chat_123", role: "user" }],
      [{ id: "chat_123" }],
    );

    expect(result.isValid).toBe(true);
    expect(result.suggestedChatId).toBeNull();
    expect(result.confidence).toBe(1.0);
  });
});
