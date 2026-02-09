import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import type { Id } from "../_generated/dataModel";
import { query } from "../_generated/server";
import { hasOwnerAccess, isUnownedChat } from "../lib/auth";
import type { ChatOwnership } from "../lib/auth";

export function hasChatWriteAccess(
  chat: ChatOwnership,
  userId: Id<"users"> | null,
  sessionId?: string,
): boolean {
  const isOwner = hasOwnerAccess(chat, userId, sessionId);
  const canClaimUnowned = isUnownedChat(chat) && !!sessionId;
  return isOwner || canClaimUnowned;
}

/** Discriminated write-access result so callers can distinguish "denied" from "not_found". */
export type WriteAccessResult = "allowed" | "denied" | "not_found";

export const canWriteChat = query({
  args: {
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.union(
    v.literal("allowed"),
    v.literal("denied"),
    v.literal("not_found"),
  ),
  handler: async (ctx, args): Promise<WriteAccessResult> => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) return "not_found";

    const userId = await getAuthUserId(ctx);
    return hasChatWriteAccess(chat, userId, args.sessionId)
      ? "allowed"
      : "denied";
  },
});
