/**
 * Chat migration and import operations
 * - Import local chats for authenticated users
 * - Publish anonymous chats
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { mutation } from "../_generated/server";
import type { Id } from "../_generated/dataModel";
import { generateOpaqueId } from "./utils";

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
            searchResults: v.optional(v.array(v.any())),
            sources: v.optional(v.array(v.string())),
            reasoning: v.optional(v.any()),
            searchMethod: v.optional(
              v.union(
                v.literal("serp"),
                v.literal("openrouter"),
                v.literal("duckduckgo"),
                v.literal("fallback"),
              ),
            ),
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
      // Try to preserve provided shareId/publicId when unique
      let shareId = ch.shareId || generateOpaqueId();
      if (ch.shareId) {
        const existingShare = await ctx.db
          .query("chats")
          .withIndex("by_share_id", (q) => q.eq("shareId", ch.shareId ?? ""))
          .unique();
        if (existingShare) shareId = generateOpaqueId();
      }
      let publicId = ch.publicId || generateOpaqueId();
      if (ch.publicId) {
        const existingPublic = await ctx.db
          .query("chats")
          .withIndex("by_public_id", (q) => q.eq("publicId", ch.publicId ?? ""))
          .unique();
        if (existingPublic) publicId = generateOpaqueId();
      }

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
          content: m.content as string | undefined,
          timestamp: m.timestamp ?? Date.now(),
          // Preserve optional metadata when present
          searchResults: m.searchResults?.map((result: any) => ({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            relevanceScore: result.relevanceScore ?? 0.5, // Default to 0.5 if missing
          })) as
            | Array<{
                title: string;
                url: string;
                snippet: string;
                relevanceScore: number;
              }>
            | undefined,
          sources: m.sources,
          reasoning: m.reasoning as string | undefined,
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
        searchResults: v.optional(v.array(v.any())),
        sources: v.optional(v.array(v.string())),
        reasoning: v.optional(v.any()),
        searchMethod: v.optional(
          v.union(
            v.literal("serp"),
            v.literal("openrouter"),
            v.literal("duckduckgo"),
            v.literal("fallback"),
          ),
        ),
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
    // Ensure unique IDs, preserve when available
    let shareId = args.shareId || generateOpaqueId();
    if (args.shareId) {
      const existingShare = await ctx.db
        .query("chats")
        .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId ?? ""))
        .unique();
      if (existingShare) shareId = generateOpaqueId();
    }
    let publicId = args.publicId || generateOpaqueId();
    if (args.publicId) {
      const existingPublic = await ctx.db
        .query("chats")
        .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId ?? ""))
        .unique();
      if (existingPublic) publicId = generateOpaqueId();
    }

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
        searchResults: m.searchResults,
        sources: m.sources,
        reasoning: m.reasoning as string | undefined,
        searchMethod: m.searchMethod,
        hasRealResults: m.hasRealResults,
      });
    }

    return { chatId, shareId, publicId };
  },
});
