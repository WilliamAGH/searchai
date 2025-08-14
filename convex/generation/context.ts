/**
 * Context building and management
 * - Message history summarization
 * - Context window optimization
 * - Security sanitization
 *
 * @deprecated This file contains duplicate context building logic.
 * Use the centralized version from ../chats/utils instead.
 */

import type { QueryCtx } from "../_generated/server";
import { robustSanitize } from "../lib/security/sanitization";
import type { Doc, Id } from "../_generated/dataModel";
import { buildContextSummary } from "../chats/utils";

// Remove the re-export since it's causing issues
// export { buildContextSummary } from "../chats/utils";

/**
 * @deprecated Use buildContextSummary from ../chats/utils instead.
 * This function is a duplicate and has been removed.
 */
// export function buildContextSummary(
//   messages:
//     | Doc<"messages">[]
//     | Array<{
//         role: "user" | "assistant" | "system";
//         content?: string;
//         timestamp?: number;
//       }>,
// ): string {
//   if (!messages || messages.length === 0) {
//     return "No previous context available.";
//   }

//   // Use all provided messages (typically last 50) for better context
//   // The calling code already limits to a reasonable number
//   const recentMessages = messages;

//   // Build summary with more context per message
//   const summary = recentMessages
//     .map((msg) => {
//       const role =
//         msg.role === "user"
//           ? "User"
//           : msg.role === "assistant"
//             ? "Assistant"
//             : "System";
//       // Increase content limit to 500 chars to preserve more context
//       const content = ((msg as any).content || "").slice(0, 500);
//       return `${role}: ${content}`;
//     })
//     .join("\n");

//   return `Recent conversation context:\n${summary}`;
// }

/**
 * Build secure context for generation with sanitization
 * @param ctx Query context
 * @param chatId Chat ID
 * @returns Secure context with summary and recent messages
 */
export async function buildSecureContext(
  ctx: QueryCtx,
  chatId: Id<"chats">,
): Promise<{
  summary: string;
  recentMessages: Doc<"messages">[];
  shouldUpdateSummary: boolean;
}> {
  // Get last 50 messages
  const messages = await ctx.db
    .query("messages")
    .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
    .order("desc")
    .take(50);

  // Sanitize all content
  const sanitized = messages.map((msg: Doc<"messages">) => ({
    ...msg,
    content: robustSanitize(msg.content || ""),
  }));

  // Build context summary using the centralized function
  const summary = buildContextSummary({
    messages: sanitized.reverse(),
    maxChars: 1600,
  });

  // Check if rolling summary needs update
  const chat = await ctx.db.get(chatId);
  const shouldUpdateSummary =
    !chat?.rollingSummaryUpdatedAt ||
    Date.now() - chat.rollingSummaryUpdatedAt > 5 * 60 * 1000;

  return {
    summary: robustSanitize(summary),
    // Newest 5, returned in chronological order
    recentMessages: sanitized.slice(0, 5).reverse(),
    shouldUpdateSummary,
  };
}
