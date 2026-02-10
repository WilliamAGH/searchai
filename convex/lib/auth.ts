/**
 * Centralized authorization helper functions.
 * Eliminates repeated auth check patterns across the codebase.
 *
 * These functions check chat ownership via userId or sessionId,
 * supporting both authenticated users and anonymous HTTP sessions.
 */

import type { Id } from "../_generated/dataModel";

/**
 * Chat document with optional ownership fields.
 * Matches the minimal shape needed for auth checks.
 */
export interface ChatOwnership {
  userId?: Id<"users">;
  sessionId?: string;
}

/**
 * Check if a user has access to a chat via userId.
 *
 * @param chat - Chat document with optional userId
 * @param userId - Current user's ID (may be null if unauthenticated)
 * @returns true if user owns the chat
 *
 * @example
 * const userId = await getAuthUserId(ctx);
 * if (hasUserAccess(chat, userId)) {
 *   // User owns this chat
 * }
 */
export function hasUserAccess(
  chat: ChatOwnership,
  userId: Id<"users"> | null,
): boolean {
  return !!(chat.userId && userId && chat.userId === userId);
}

/**
 * Check if a session has access to a chat via sessionId.
 *
 * @param chat - Chat document with optional sessionId
 * @param sessionId - Current session ID (may be undefined)
 * @returns true if session owns the chat
 *
 * @example
 * if (hasSessionAccess(chat, args.sessionId)) {
 *   // Session owns this chat
 * }
 */
export function hasSessionAccess(
  chat: ChatOwnership,
  sessionId: string | undefined,
): boolean {
  return !!(chat.sessionId && sessionId && chat.sessionId === sessionId);
}

/**
 * Check if a user or session is authorized to access a chat.
 * Combines both userId and sessionId checks.
 *
 * @param chat - Chat document with optional ownership fields
 * @param userId - Current user's ID (may be null)
 * @param sessionId - Current session ID (may be undefined)
 * @returns true if either userId or sessionId grants access
 *
 * @example
 * const userId = await getAuthUserId(ctx);
 * if (!isAuthorized(chat, userId, args.sessionId)) {
 *   throw new Error("Unauthorized");
 * }
 */
export function hasPrimaryOwnerAccess(
  chat: ChatOwnership,
  userId: Id<"users"> | null,
  sessionId?: string,
): boolean {
  if (chat.userId) {
    return hasUserAccess(chat, userId);
  }
  return hasSessionAccess(chat, sessionId);
}

/**
 * Check write ownership using either account owner or originating session.
 *
 * Unlike `isAuthorized`, this intentionally supports dual ownership even when
 * both `userId` and `sessionId` are present on the chat.
 */
export function hasOwnerAccess(
  chat: ChatOwnership,
  userId: Id<"users"> | null,
  sessionId?: string,
): boolean {
  return hasUserAccess(chat, userId) || hasSessionAccess(chat, sessionId);
}

/**
 * Check if a chat has no ownership yet (newly created).
 * Used to allow first access to claim ownership.
 *
 * @param chat - Chat document
 * @returns true if chat has no userId and no sessionId
 */
export function isUnownedChat(chat: ChatOwnership): boolean {
  return !chat.userId && !chat.sessionId;
}

/**
 * Check if a chat is shared or public.
 * Shared/public chats are accessible to anyone without ownership checks.
 *
 * @param chat - Chat document with optional privacy field
 * @returns true if chat.privacy is "shared" or "public"
 */
export function isSharedOrPublicChat(chat: { privacy?: string }): boolean {
  return chat.privacy === "shared" || chat.privacy === "public";
}

/**
 * Validate a workflow token for chat access.
 * Checks: token exists, matches the target chat, is active, and not expired.
 *
 * Used by HTTP query/mutation variants that lack Convex auth context.
 * The token proves the caller had legitimate access at token creation time.
 *
 * @param token - Workflow token document (or null if not provided)
 * @param chatId - Target chat ID to validate against
 * @returns true if the token grants access to the chat
 */
export function isValidWorkflowToken(
  token: {
    chatId: Id<"chats">;
    status: "active" | "completed" | "invalidated";
    expiresAt: number;
  } | null,
  chatId: Id<"chats">,
): boolean {
  return (
    !!token &&
    token.chatId === chatId &&
    token.status === "active" &&
    token.expiresAt > Date.now()
  );
}
