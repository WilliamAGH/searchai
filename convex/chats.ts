/**
 * Chat management functions
 * - CRUD operations for chats/messages
 * - Share ID generation and lookup
 * - Auth-based access control
 * - Rolling summary for context compression
 */

import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, mutation, query, internalMutation } from "./_generated/server";
import { api } from "./_generated/api";

// Shared summarization util (pure; can be imported by other Convex files)
export function buildContextSummary(params: {
  messages: Array<{
    role: "user" | "assistant" | "system";
    content?: string;
    timestamp?: number;
  }>;
  rollingSummary?: string;
  maxChars?: number;
}): string {
  const { messages, rollingSummary, maxChars = 1600 } = params;
  const sanitize = (s?: string) => (s || "").replace(/\s+/g, " ").trim();
  const recent = messages.slice(-14); // cap to last 14 turns for cost

  // Collect last 2 user turns verbatim (truncated), then last assistant, then compact older
  const lastUsers = [...recent]
    .reverse()
    .filter((m) => m.role === "user")
    .slice(0, 2)
    .reverse();
  const lastAssistant = [...recent]
    .reverse()
    .find((m) => m.role === "assistant");

  const lines: string[] = [];
  if (rollingSummary) {
    lines.push(sanitize(rollingSummary).slice(0, 800));
  }
  for (const m of lastUsers) {
    const txt = sanitize(m.content).slice(0, 380);
    if (txt) lines.push(`User: ${txt}`);
  }
  if (lastAssistant) {
    const txt = sanitize(lastAssistant.content).slice(0, 380);
    if (txt) lines.push(`Assistant: ${txt}`);
  }
  // Add compact one-liners for the rest, oldest to newest, skipping ones already included
  const included = new Set(lines);
  for (const m of recent) {
    const txt = sanitize(m.content);
    if (!txt) continue;
    const line = `${m.role === "assistant" ? "Assistant" : m.role === "user" ? "User" : "System"}: ${txt.slice(0, 220)}`;
    if (!included.has(line)) {
      lines.push(line);
    }
    if (lines.join(" \n ").length >= maxChars) break;
  }
  return lines.join(" \n ").slice(0, maxChars);
}

// Lightweight opaque ID generator that doesn't rely on Node.js APIs
function generateOpaqueId(): string {
  const timePart = Date.now().toString(36);
  const rand = () => Math.random().toString(36).slice(2, 10);
  return (timePart + rand() + rand()).slice(0, 32);
}

/**
 * Create new chat
 * - Generates unique share ID
 * - Associates with authenticated user
 * - Sets timestamps
 * @param title - Chat title
 * @param shareId - Optional custom share ID
 * @returns Chat ID
 */

export const createChat = mutation({
  args: {
    title: v.string(),
  },
  returns: v.id("chats"),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const now = Date.now();

    // Generate URL-safe opaque IDs without Node.js built-ins (V8 runtime safe)
    const shareId = generateOpaqueId();
    const publicId = generateOpaqueId();

    return await ctx.db.insert("chats", {
      title: args.title,
      userId: userId || undefined,
      shareId,
      publicId,
      privacy: "private",
      createdAt: now,
      updatedAt: now,
    });
  },
});

/**
 * Get user's chats
 * - Returns empty for unauth users
 * - Ordered by creation desc
 * @returns Array of user's chats
 */
export const getUserChats = query({
  args: {},
  returns: v.array(v.any()),
  handler: async (ctx) => {
    const userId = await getAuthUserId(ctx);

    // Return empty array for unauthenticated users - they'll use local storage
    if (!userId) return [];

    return await ctx.db
      .query("chats")
      .withIndex("by_user", (q) => q.eq("userId", userId))
      .order("desc")
      .collect();
  },
});

/**
 * Get chat by ID
 * - Validates ownership
 * - Allows anonymous chats
 * @param chatId - Chat database ID
 * @returns Chat or null
 */
export const getChatById = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return null;

    return chat;
  },
});

export const getChatByOpaqueId = query({
  args: { chatId: v.id("chats") },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return null;

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return null;

    return chat;
  },
});

/**
 * Get chat by share ID
 * - For shareable URLs
 * - Checks sharing permissions
 * @param shareId - Unique share identifier
 * @returns Chat or null
 */
export const getChatByShareId = query({
  args: { shareId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_share_id", (q) => q.eq("shareId", args.shareId))
      .unique();

    if (!chat) return null;

    // Only return shared or public chats
    if (chat.privacy !== "shared" && chat.privacy !== "public") {
      const userId = await getAuthUserId(ctx);
      if (chat.userId !== userId) return null;
    }

    return chat;
  },
});

export const getChatByPublicId = query({
  args: { publicId: v.string() },
  returns: v.union(v.any(), v.null()),
  handler: async (ctx, args) => {
    const chat = await ctx.db
      .query("chats")
      .withIndex("by_public_id", (q) => q.eq("publicId", args.publicId))
      .unique();

    if (!chat) return null;

    if (chat.privacy !== "public") {
      return null;
    }

    return chat;
  },
});

/**
 * Get chat messages
 * - Validates chat ownership
 * - Returns chronological order
 * @param chatId - Chat database ID
 * @returns Array of messages
 */
export const getChatMessages = query({
  args: { chatId: v.id("chats") },
  returns: v.array(v.any()),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) return [];

    // Allow access to chats without userId (anonymous chats) or user's own chats
    if (chat.userId && chat.userId !== userId) return [];

    return await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("asc")
      .collect();
  },
});

/**
 * Update chat title
 * - Validates ownership
 * - Updates timestamp
 * @param chatId - Chat database ID
 * @param title - New title
 */
export const updateChatTitle = mutation({
  args: {
    chatId: v.id("chats"),
    title: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.chatId, {
      title: args.title,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Update rolling summary for a chat
 * - Compact summary of latest context (<= ~1-2KB)
 * - Used by planner to shrink tokens
 */
export const updateRollingSummary = internalMutation({
  args: {
    chatId: v.id("chats"),
    summary: v.string(),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.chatId, {
      rollingSummary: args.summary.slice(0, 2000),
      rollingSummaryUpdatedAt: Date.now(),
      updatedAt: Date.now(),
    });
  },
});

/**
 * Summarize last N messages (cheap, server-side)
 * - Returns a compact bullet summary for bootstrapping a new chat
 */
export const summarizeRecent = query({
  args: { chatId: v.id("chats"), limit: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    const limit = Math.max(1, Math.min(args.limit ?? 14, 40));
    const q = ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .order("desc");
    const buf: any[] = [];
    for await (const m of q) {
      buf.push(m);
      if (buf.length >= limit) break;
    }
    const ordered = buf.reverse();
    const chat = await ctx.db.get(args.chatId);
    return buildContextSummary({
      messages: ordered,
      rollingSummary: (chat as any)?.rollingSummary,
      maxChars: 1600,
    });
  },
});

/**
 * Action wrapper to build a compact summary (calls query under the hood)
 * - Allows clients to request a summary imperatively
 */
export const summarizeRecentAction = action({
  args: { chatId: v.id("chats"), limit: v.optional(v.number()) },
  returns: v.string(),
  handler: async (ctx, args): Promise<string> => {
    const lim = Math.max(1, Math.min(args.limit ?? 14, 40));
    // Load messages via query to respect auth and avoid using ctx.db in actions
    const all: Array<{
      role: "user" | "assistant" | "system";
      content?: string;
      timestamp?: number;
    }> = await ctx.runQuery(api.chats.getChatMessages, { chatId: args.chatId });
    const ordered = all.slice(-lim);
    // Break type circularity by annotating the query result as unknown
    const chatResult: unknown = await ctx.runQuery(api.chats.getChatById, {
      chatId: args.chatId,
    });
    return buildContextSummary({
      messages: ordered,
      rollingSummary: (chatResult as any)?.rollingSummary,
      maxChars: 1600,
    });
  },
});

/**
 * Share chat publicly/privately
 * - Sets sharing flags
 * - Validates ownership
 * @param chatId - Chat database ID
 * @param isPublic - Public visibility
 */
export const updateChatPrivacy = mutation({
  args: {
    chatId: v.id("chats"),
    privacy: v.union(
      v.literal("private"),
      v.literal("shared"),
      v.literal("public"),
    ),
  },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    await ctx.db.patch(args.chatId, {
      privacy: args.privacy,
      updatedAt: Date.now(),
    });
  },
});

/**
 * Delete chat and messages
 * - Cascades to all messages
 * - Validates ownership
 * @param chatId - Chat database ID
 */
export const deleteChat = mutation({
  args: { chatId: v.id("chats") },
  returns: v.null(),
  handler: async (ctx, args) => {
    const userId = await getAuthUserId(ctx);
    const chat = await ctx.db.get(args.chatId);

    if (!chat) throw new Error("Chat not found");
    if (chat.userId && chat.userId !== userId) throw new Error("Unauthorized");

    // Delete all messages in the chat
    const messages = await ctx.db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", args.chatId))
      .collect();

    for (const message of messages) {
      await ctx.db.delete(message._id);
    }

    await ctx.db.delete(args.chatId);
  },
});

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

    const mappings: Array<{ localId: string; chatId: Id<"chats"> }> = [] as any;

    for (const ch of args.chats) {
      const now = Date.now();
      const shareId = generateOpaqueId();
      const publicId = generateOpaqueId();

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
          // Preserve optional metadata when present
          searchResults: m.searchResults as any,
          sources: m.sources,
          reasoning: m.reasoning as any,
          searchMethod: m.searchMethod,
          hasRealResults: m.hasRealResults,
        });
      }

      mappings.push({ localId: ch.localId, chatId });
    }

    return mappings;
  },
});
