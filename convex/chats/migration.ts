/**
 * Chat migration and import operations
 * - Import local chats for authenticated users
 * - Publish anonymous chats
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { MutationCtx } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateShareId, generatePublicId } from "../lib/uuid";
import { vSearchMethod, vWebResearchSource } from "../lib/validators";

/** Filter to string type, returning undefined for non-string values. */
function filterToString(value: unknown): string | undefined {
  return typeof value === "string" ? value : undefined;
}

/** Preserve a candidate ID when unique, otherwise generate a fresh one. */
async function resolveUniqueId(
  candidate: string | undefined,
  generate: () => string,
  exists: (id: string) => Promise<boolean>,
): Promise<string> {
  if (!candidate) return generate();
  return (await exists(candidate)) ? generate() : candidate;
}

async function shareIdExists(
  ctx: { db: MutationCtx["db"] },
  id: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("chats")
    .withIndex("by_share_id", (q) => q.eq("shareId", id))
    .unique();
  return row !== null;
}

async function publicIdExists(
  ctx: { db: MutationCtx["db"] },
  id: string,
): Promise<boolean> {
  const row = await ctx.db
    .query("chats")
    .withIndex("by_public_id", (q) => q.eq("publicId", id))
    .unique();
  return row !== null;
}

/**
 * Import locally stored chats/messages into the authenticated account
 * - Creates chats for the current user
 * - Replays messages preserving role/content/timestamps
 * - Returns mapping from local IDs to newly created server chat IDs
 */
export const importLocalChats = mutation({
  args: {
    chats: v.array(
      v.object({
        localId: v.string(),
        title: v.string(),
        privacy: v.optional(
          v.union(
            v.literal("private"),
            v.literal("shared"),
            v.literal("public"),
          ),
        ),
        createdAt: v.number(),
        updatedAt: v.number(),
        shareId: v.optional(v.string()),
        publicId: v.optional(v.string()),
        messages: v.array(
          v.object({
            role: v.union(v.literal("user"), v.literal("assistant")),
            content: v.optional(v.string()),
            timestamp: v.optional(v.number()),
            // Optional metadata preserved when available
            webResearchSources: v.optional(v.array(vWebResearchSource)),
            reasoning: v.optional(v.any()),
            searchMethod: v.optional(vSearchMethod),
            hasRealResults: v.optional(v.boolean()),
          }),
        ),
      }),
    ),
  },
  returns: v.array(v.object({ localId: v.string(), chatId: v.id("chats") })),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    if (!userId) throw new Error("Unauthorized");

    const mappings: Array<{ localId: string; chatId: Id<"chats"> }> = [];

    for (const ch of args.chats) {
      const now = Date.now();
      const shareId = await resolveUniqueId(ch.shareId, generateShareId, (id) =>
        shareIdExists(ctx, id),
      );
      const publicId = await resolveUniqueId(
        ch.publicId,
        generatePublicId,
        (id) => publicIdExists(ctx, id),
      );

      const chatId = await ctx.db.insert("chats", {
        title: ch.title || "New Chat",
        userId,
        shareId,
        publicId,
        privacy: ch.privacy || "private",
        createdAt: ch.createdAt || now,
        updatedAt: ch.updatedAt || now,
      });

      // Insert messages in chronological order
      const ordered = [...ch.messages].sort(
        (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
      );
      for (const m of ordered) {
        await ctx.db.insert("messages", {
          chatId,
          role: m.role,
          content: m.content,
          timestamp: m.timestamp ?? Date.now(),
          webResearchSources: m.webResearchSources,
          reasoning: filterToString(m.reasoning),
          searchMethod: m.searchMethod,
          hasRealResults: m.hasRealResults,
        });
      }

      mappings.push({ localId: ch.localId, chatId });
    }

    return mappings;
  },
});

/**
 * Publish a chat without authentication (anonymous share)
 * - Inserts a chat with undefined userId
 * - Ensures unique shareId/publicId (preserves provided when unique)
 * - Inserts provided messages chronologically
 */
export const publishAnonymousChat = mutation({
  args: {
    title: v.string(),
    shareId: v.optional(v.string()),
    publicId: v.optional(v.string()),
    privacy: v.union(v.literal("shared"), v.literal("public")),
    messages: v.array(
      v.object({
        role: v.union(v.literal("user"), v.literal("assistant")),
        content: v.optional(v.string()),
        timestamp: v.optional(v.number()),
        webResearchSources: v.optional(v.array(vWebResearchSource)),
        reasoning: v.optional(v.any()),
        searchMethod: v.optional(vSearchMethod),
        hasRealResults: v.optional(v.boolean()),
      }),
    ),
  },
  returns: v.object({
    chatId: v.id("chats"),
    shareId: v.string(),
    publicId: v.string(),
  }),
  handler: async (ctx, args) => {
    const shareId = await resolveUniqueId(args.shareId, generateShareId, (id) =>
      shareIdExists(ctx, id),
    );
    const publicId = await resolveUniqueId(
      args.publicId,
      generatePublicId,
      (id) => publicIdExists(ctx, id),
    );

    const now = Date.now();
    const chatId = await ctx.db.insert("chats", {
      title: args.title || "Shared Chat",
      userId: undefined,
      shareId,
      publicId,
      privacy: args.privacy,
      createdAt: now,
      updatedAt: now,
    });

    // Insert messages in chronological order
    const ordered = [...args.messages].sort(
      (a, b) => (a.timestamp ?? 0) - (b.timestamp ?? 0),
    );
    for (const m of ordered) {
      await ctx.db.insert("messages", {
        chatId,
        role: m.role,
        content: m.content,
        timestamp: m.timestamp ?? Date.now(),
        webResearchSources: m.webResearchSources,
        reasoning: filterToString(m.reasoning),
        searchMethod: m.searchMethod,
        hasRealResults: m.hasRealResults,
      });
    }

    return { chatId, shareId, publicId };
  },
});
