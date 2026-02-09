import { describe, expect, it } from "vitest";
import { hasChatWriteAccess } from "../../../convex/chats/writeAccess";
import { safeConvexId } from "../../../convex/lib/validators";

function requireUserId(raw: string) {
  const id = safeConvexId<"users">(raw);
  if (!id) throw new Error(`Invalid user id test fixture: ${raw}`);
  return id;
}

describe("hasChatWriteAccess", () => {
  const ownerId = requireUserId("owneruserid123");

  it("allows account owners to write", () => {
    const canWrite = hasChatWriteAccess(
      { userId: ownerId, sessionId: "session-owner" },
      ownerId,
      "different-session",
    );

    expect(canWrite).toBe(true);
  });

  it("allows the original browser session even when chat has a user owner", () => {
    const canWrite = hasChatWriteAccess(
      { userId: ownerId, sessionId: "session-owner" },
      null,
      "session-owner",
    );

    expect(canWrite).toBe(true);
  });

  it("denies non-owners on shared/public-style access", () => {
    const canWrite = hasChatWriteAccess(
      { userId: ownerId, sessionId: "session-owner" },
      null,
      "session-other",
    );

    expect(canWrite).toBe(false);
  });

  it("allows unowned chat claim when session id is present", () => {
    const canWrite = hasChatWriteAccess({}, null, "session-new");

    expect(canWrite).toBe(true);
  });

  it("denies writes for unowned chats without session id", () => {
    const canWrite = hasChatWriteAccess({}, null, undefined);

    expect(canWrite).toBe(false);
  });
});
