import { describe, it, expect } from "vitest";
import { isValidWorkflowToken } from "../../../convex/lib/auth";

describe("isValidWorkflowToken", () => {
  const chatId = "chat123" as any;
  const otherChatId = "chat456" as any;
  const futureExpiry = Date.now() + 60_000;
  const pastExpiry = Date.now() - 1;

  it("returns true for active, non-expired token matching chatId", () => {
    const token = { chatId, status: "active", expiresAt: futureExpiry };
    expect(isValidWorkflowToken(token, chatId)).toBe(true);
  });

  it("returns false for null token", () => {
    expect(isValidWorkflowToken(null, chatId)).toBe(false);
  });

  it("returns false when chatId does not match", () => {
    const token = {
      chatId: otherChatId,
      status: "active",
      expiresAt: futureExpiry,
    };
    expect(isValidWorkflowToken(token, chatId)).toBe(false);
  });

  it("returns false for completed token", () => {
    const token = { chatId, status: "completed", expiresAt: futureExpiry };
    expect(isValidWorkflowToken(token, chatId)).toBe(false);
  });

  it("returns false for invalidated token", () => {
    const token = { chatId, status: "invalidated", expiresAt: futureExpiry };
    expect(isValidWorkflowToken(token, chatId)).toBe(false);
  });

  it("returns false for expired token", () => {
    const token = { chatId, status: "active", expiresAt: pastExpiry };
    expect(isValidWorkflowToken(token, chatId)).toBe(false);
  });

  it("returns false for token expiring exactly now", () => {
    const token = { chatId, status: "active", expiresAt: Date.now() };
    expect(isValidWorkflowToken(token, chatId)).toBe(false);
  });
});
