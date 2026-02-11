import { describe, expect, it, vi } from "vitest";
import { initializeWorkflowSession } from "../../../convex/agents/orchestration_session";
import { safeConvexId } from "../../../convex/lib/validators";

function requireChatId(raw: string) {
  const id = safeConvexId<"chats">(raw);
  if (!id) throw new Error(`Invalid chat id test fixture: ${raw}`);
  return id;
}

describe("initializeWorkflowSession write access gate", () => {
  const chatId = requireChatId("chatid123456789");

  it("rejects non-writers before minting a workflow token", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("denied"),
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };

    await expect(
      initializeWorkflowSession(
        ctx,
        { chatId, sessionId: "session-other", userQuery: "Can I write?" },
        "workflow_1",
        "nonce_1",
      ),
    ).rejects.toThrow("Unauthorized: no write access to chat");

    expect(ctx.runMutation).not.toHaveBeenCalled();
    expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(), {
      chatId,
      sessionId: "session-other",
    });
  });

  it("throws not-found when chat does not exist", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("not_found"),
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };

    await expect(
      initializeWorkflowSession(
        ctx,
        { chatId, sessionId: "session-other", userQuery: "Exists?" },
        "workflow_1",
        "nonce_1",
      ),
    ).rejects.toThrow("Chat not found");

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("wraps infrastructure errors with context", async () => {
    const ctx = {
      runQuery: vi.fn().mockRejectedValue(new Error("network timeout")),
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };

    await expect(
      initializeWorkflowSession(
        ctx,
        { chatId, sessionId: "session-a", userQuery: "infra fail" },
        "workflow_1",
        "nonce_1",
      ),
    ).rejects.toThrow("Failed to verify write access");

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });

  it("proceeds to mint token when access is allowed", async () => {
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce("allowed") // canWriteChat
        .mockResolvedValueOnce({ _id: chatId }) // chats.getChatByIdHttp
        .mockResolvedValueOnce([]), // chats.getChatMessagesHttp
      runMutation: vi
        .fn()
        .mockResolvedValueOnce("token_123")
        .mockResolvedValueOnce(null),
      runAction: vi.fn(),
    };

    const session = await initializeWorkflowSession(
      ctx,
      { chatId, sessionId: "session-ok", userQuery: "Can I write?" },
      "workflow_1",
      "nonce_1",
    );

    expect(session.workflowTokenId).toBe("token_123");
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
    expect(ctx.runQuery).toHaveBeenNthCalledWith(1, expect.anything(), {
      chatId,
      sessionId: "session-ok",
    });
  });

  it("supports session-only access", async () => {
    const ctx = {
      runQuery: vi
        .fn()
        .mockResolvedValueOnce("allowed") // canWriteChat
        .mockResolvedValueOnce({ _id: chatId }) // chats.getChatById
        .mockResolvedValueOnce([]), // chats.getChatMessages
      runMutation: vi
        .fn()
        .mockResolvedValueOnce("token_456")
        .mockResolvedValueOnce(null),
      runAction: vi.fn(),
    };

    await initializeWorkflowSession(
      ctx,
      { chatId, userQuery: "Anon?" },
      "workflow_1",
      "nonce_1",
    );

    expect(ctx.runQuery).toHaveBeenCalledWith(expect.anything(), {
      chatId,
      sessionId: undefined,
    });
    expect(ctx.runMutation).toHaveBeenCalledTimes(2);
  });
});
