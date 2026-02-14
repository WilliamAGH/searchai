/**
 * File Storage — Auth-gated Uploads with Magic-byte Validation
 *
 * Convex built-in storage integration for image uploads.
 * Uses ctx.storage.generateUploadUrl() — the idiomatic Convex upload pattern.
 *
 * Security:
 *  - All operations require authenticated user OR valid sessionId
 *  - validateImageUpload inspects magic bytes to reject non-image files
 *
 * @see {@link https://docs.convex.dev/file-storage/upload-files} Convex upload docs
 * @see {@link https://docs.convex.dev/file-storage/serve-files} Convex serve docs
 */
import { getAuthUserId } from "@convex-dev/auth/server";
import { v } from "convex/values";
import { action, internalQuery, mutation, query } from "./_generated/server";
import type { QueryCtx } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { internal } from "./_generated/api";
import { isValidUuidV7 } from "./lib/uuid";
import {
  hasOwnerAccess,
  isSharedOrPublicChat,
  isUnownedChat,
} from "./lib/auth";

/**
 * Require authenticated user or valid sessionId. Shared by all storage operations.
 * Throws on unauthorized access.
 */
async function requireStorageAccess(
  ctx: Parameters<typeof getAuthUserId>[0],
  sessionId?: string,
): Promise<void> {
  const userId = await getAuthUserId(ctx);
  if (!userId && !sessionId) {
    throw new Error(
      "Unauthorized: authentication or session required to access files",
    );
  }
  if (sessionId && !isValidUuidV7(sessionId)) {
    throw new Error("Invalid sessionId format");
  }
}

/**
 * Generate a short-lived upload URL (POST target). Expires in ~1 hour.
 * Requires either an authenticated user or a valid sessionId.
 */
export const generateUploadUrl = mutation({
  args: { sessionId: v.optional(v.string()) },
  returns: v.string(),
  handler: async (ctx, args) => {
    await requireStorageAccess(ctx, args.sessionId);
    return await ctx.storage.generateUploadUrl();
  },
});

/**
 * Paginate through chat messages to collect the subset of requestedIds
 * that are actually linked to messages in the given chat.
 */
async function filterAuthorizedStorageIds(
  db: QueryCtx["db"],
  chatId: Id<"chats">,
  requestedIds: readonly Id<"_storage">[],
): Promise<Set<Id<"_storage">>> {
  const remaining = new Set(requestedIds);
  const authorized = new Set<Id<"_storage">>();
  let cursor: string | null = null;

  while (remaining.size > 0) {
    const page = await db
      .query("messages")
      .withIndex("by_chatId", (q) => q.eq("chatId", chatId))
      .order("desc")
      .paginate({ numItems: 200, cursor });

    for (const message of page.page) {
      if (!message.imageStorageIds?.length) continue;
      for (const storageId of message.imageStorageIds) {
        if (!remaining.has(storageId)) continue;
        remaining.delete(storageId);
        authorized.add(storageId);
      }
      if (remaining.size === 0) break;
    }

    if (page.isDone) break;
    cursor = page.continueCursor;
  }

  return authorized;
}

/** Batch-resolve multiple storage IDs to serving URLs. Eliminates N+1 queries. */
export const getFileUrls = query({
  args: {
    storageIds: v.array(v.id("_storage")),
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    if (args.storageIds.length === 0) return [];

    // Validate sessionId format if provided (cheap check before any DB reads).
    if (args.sessionId && !isValidUuidV7(args.sessionId)) {
      throw new Error("Invalid sessionId format");
    }

    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    const userId = await getAuthUserId(ctx);

    // Read access: owner, session-holder, or shared/public chat viewer.
    // Matches getChatMessages access pattern — no auth required for shared/public.
    const isOwner = hasOwnerAccess(chat, userId, args.sessionId);
    const canClaimUnowned = isUnownedChat(chat) && !!args.sessionId;
    const isReadable = isOwner || canClaimUnowned || isSharedOrPublicChat(chat);
    if (!isReadable) {
      throw new Error("Unauthorized: no access to chat images");
    }

    // Ensure storage IDs belong to this chat. Without this, callers with access
    // to chatA could resolve URLs for storage IDs belonging to chatB.
    const authorized = await filterAuthorizedStorageIds(
      ctx.db,
      args.chatId,
      args.storageIds,
    );

    // Return null for unauthorized/unlinked IDs to avoid disclosing whether the
    // storage blob exists outside the caller's chat access.
    const filteredCount = args.storageIds.filter(
      (id) => !authorized.has(id),
    ).length;
    if (filteredCount > 0) {
      console.warn("[STORAGE_ACCESS_FILTERED]", {
        chatId: args.chatId,
        filteredCount,
        totalRequested: args.storageIds.length,
      });
    }

    return Promise.all(
      args.storageIds.map(async (storageId) => {
        if (!authorized.has(storageId)) return null;
        return await ctx.storage.getUrl(storageId);
      }),
    );
  },
});

const MAX_IMAGE_BYTES = 10 * 1024 * 1024; // 10 MB

/**
 * Read storage metadata from Convex system tables.
 *
 * Note: Convex `ctx.storage.getMetadata` exists but is deprecated in favor of
 * reading the `_storage` system table.
 */
export const getStorageFileMetadata = internalQuery({
  args: { storageId: v.id("_storage") },
  returns: v.union(
    v.object({
      size: v.float64(),
      contentType: v.union(v.string(), v.null()),
    }),
    v.null(),
  ),
  handler: async (ctx, args) => {
    // Internal-only: auth is enforced by the calling action, not here.
    const doc = await ctx.db.system.get(args.storageId);
    if (!doc) return null;
    return { size: doc.size, contentType: doc.contentType ?? null };
  },
});

/**
 * Magic-byte signatures for supported image formats.
 */
const IMAGE_SIGNATURES: ReadonlyArray<{
  bytes: readonly number[];
}> = [
  // PNG: \x89PNG
  { bytes: [0x89, 0x50, 0x4e, 0x47] },
  // JPEG: SOI marker + APP marker
  { bytes: [0xff, 0xd8, 0xff] },
];

/** Check whether a byte buffer starts with a known image signature. */
export function hasImageMagicBytes(header: Uint8Array): boolean {
  return IMAGE_SIGNATURES.some((sig) =>
    sig.bytes.every((b, i) => header[i] === b),
  );
}

/**
 * Delete a storage blob, returning the error (if any) so the caller can
 * attach it as `cause` on its own descriptive error.
 */
async function deleteStorageBlob(
  ctx: { storage: { delete: (id: Id<"_storage">) => Promise<void> } },
  storageId: Id<"_storage">,
): Promise<Error | undefined> {
  try {
    await ctx.storage.delete(storageId);
    return undefined;
  } catch (deleteError) {
    const msg =
      deleteError instanceof Error ? deleteError.message : String(deleteError);
    return new Error(`[STORAGE_CLEANUP_FAILED] storageId=${storageId}: ${msg}`);
  }
}

/**
 * Validate file content (size + magic bytes). Caller resolves metadata and URL beforehand.
 * Exported so the HTTP streaming handler can call it directly without spawning a child action.
 */
export async function validateImageBlobContent(
  ctx: { storage: { delete: (id: Id<"_storage">) => Promise<void> } },
  storageId: Id<"_storage">,
  fileUrl: string,
  fileSize: number,
): Promise<void> {
  if (fileSize > MAX_IMAGE_BYTES) {
    const cleanupError = await deleteStorageBlob(ctx, storageId);
    throw new Error("Image is too large. Max 10 MB per file.", {
      cause: cleanupError,
    });
  }

  // Fetch only the first 12 bytes (enough for all supported signatures).
  // Some CDNs ignore Range and return the full body — we only inspect 12 bytes.
  const response = await fetch(fileUrl, {
    headers: { Range: "bytes=0-11" },
  });
  if (!response.ok) {
    const cleanupError = await deleteStorageBlob(ctx, storageId);
    throw new Error("Failed to read uploaded file for validation", {
      cause: cleanupError,
    });
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length < 3 || !hasImageMagicBytes(buffer)) {
    const cleanupError = await deleteStorageBlob(ctx, storageId);
    throw new Error("Unsupported image format. Please upload PNG or JPEG.", {
      cause: cleanupError,
    });
  }
}

/**
 * Validate an uploaded file is a genuine image by inspecting magic bytes.
 * Deletes the file from storage if validation fails.
 *
 * Call this after uploading a file and before persisting the storageId
 * in a message. Returns the validated storageId on success.
 */
export const validateImageUpload = action({
  args: { storageId: v.id("_storage"), sessionId: v.optional(v.string()) },
  returns: v.id("_storage"),
  handler: async (ctx, args) => {
    await requireStorageAccess(ctx, args.sessionId);

    const metadata = await ctx.runQuery(
      internal.storage.getStorageFileMetadata,
      { storageId: args.storageId },
    );
    if (!metadata) {
      const cleanupError = await deleteStorageBlob(ctx, args.storageId);
      throw new Error("Uploaded file not found in storage", {
        cause: cleanupError,
      });
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      const cleanupError = await deleteStorageBlob(ctx, args.storageId);
      throw new Error("Uploaded file not found in storage", {
        cause: cleanupError,
      });
    }

    await validateImageBlobContent(ctx, args.storageId, url, metadata.size);
    return args.storageId;
  },
});
