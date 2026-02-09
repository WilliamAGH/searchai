import { describe, expect, it } from "vitest";
import {
  hasChatWriteAccess,
  isHttpWriteAuthorized,
} from "../../../convex/chats/writeAccess";
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

describe("isHttpWriteAuthorized", () => {
  it("allows base access when no token is provided", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: true,
        hasValidToken: false,
        tokenProvided: false,
        tokenSessionMatches: false,
      }),
    ).toBe(true);
  });

  it("denies when no base access and no token", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: false,
        hasValidToken: false,
        tokenProvided: false,
        tokenSessionMatches: false,
      }),
    ).toBe(false);
  });

  it("allows valid token with matching session", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: false,
        hasValidToken: true,
        tokenProvided: true,
        tokenSessionMatches: true,
      }),
    ).toBe(true);
  });

  it("denies valid token with mismatched session", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: true,
        hasValidToken: true,
        tokenProvided: true,
        tokenSessionMatches: false,
      }),
    ).toBe(false);
  });

  it("denies invalid token even with base access", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: true,
        hasValidToken: false,
        tokenProvided: true,
        tokenSessionMatches: true,
      }),
    ).toBe(false);
  });

  it("denies expired token without base access (fixed vulnerability)", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: false,
        hasValidToken: false,
        tokenProvided: true,
        tokenSessionMatches: true,
      }),
    ).toBe(false);
  });

  it("allows base access with valid session-matched token", () => {
    expect(
      isHttpWriteAuthorized({
        hasBaseAccess: true,
        hasValidToken: true,
        tokenProvided: true,
        tokenSessionMatches: true,
      }),
    ).toBe(true);
  });
});
