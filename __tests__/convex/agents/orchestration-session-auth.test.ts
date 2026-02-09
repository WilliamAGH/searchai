import { describe, expect, it, vi } from "vitest";
import { initializeWorkflowSession } from "../../../convex/agents/orchestration_session";
import { safeConvexId } from "../../../convex/lib/validators";

function requireChatId(raw: string) {
  const id = safeConvexId<"chats">(raw);
  if (!id) throw new Error(`Invalid chat id test fixture: ${raw}`);
  return id;
}

describe("initializeWorkflowSession write access gate", () => {
  it("rejects non-writers before minting a workflow token", async () => {
    const ctx = {
      runQuery: vi.fn().mockResolvedValue("denied"),
      runMutation: vi.fn(),
      runAction: vi.fn(),
    };

    await expect(
      initializeWorkflowSession(
        ctx,
        {
          chatId: requireChatId("chatid123456789"),
          sessionId: "session-other",
          userQuery: "Can I write?",
        },
        "workflow_1",
        "nonce_1",
      ),
    ).rejects.toThrow("Unauthorized: no write access to chat");

    expect(ctx.runMutation).not.toHaveBeenCalled();
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
        {
          chatId: requireChatId("chatid123456789"),
          sessionId: "session-other",
          userQuery: "Does this chat exist?",
        },
        "workflow_1",
        "nonce_1",
      ),
    ).rejects.toThrow("Chat not found");

    expect(ctx.runMutation).not.toHaveBeenCalled();
  });
});
