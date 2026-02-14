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

/** Batch-resolve multiple storage IDs to serving URLs. Eliminates N+1 queries. */
export const getFileUrls = query({
  args: {
    storageIds: v.array(v.id("_storage")),
    chatId: v.id("chats"),
    sessionId: v.optional(v.string()),
  },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    const chat = await ctx.db.get(args.chatId);
    if (!chat) throw new Error("Chat not found");
    const userId = await getAuthUserId(ctx);

    // Read access: owner, session-holder, or shared/public chat viewer.
    // Write access is NOT required — viewers of shared chats need image URLs.
    const isOwner = hasOwnerAccess(chat, userId, args.sessionId);
    const canClaimUnowned = isUnownedChat(chat) && !!args.sessionId;
    const isReadable = isOwner || canClaimUnowned || isSharedOrPublicChat(chat);
    if (!isReadable) {
      throw new Error("Unauthorized: no access to chat images");
    }
    return Promise.all(args.storageIds.map((id) => ctx.storage.getUrl(id)));
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

/** Best-effort cleanup: delete a storage blob without masking the caller's error. */
async function safeDeleteStorage(
  ctx: { storage: { delete: (id: Id<"_storage">) => Promise<void> } },
  storageId: Id<"_storage">,
): Promise<void> {
  try {
    await ctx.storage.delete(storageId);
  } catch (deleteError) {
    // Intentional graceful degradation: this runs inside a validation-failure
    // path that is about to throw its own descriptive error.  Rethrowing here
    // would replace that error with a less useful cleanup message.  We log
    // with a grep-friendly prefix so orphaned blobs can be monitored.
    console.error("[STORAGE_CLEANUP_FAILED]", storageId, deleteError);
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
    await safeDeleteStorage(ctx, storageId);
    throw new Error("Image is too large. Max 10 MB per file.");
  }

  // Fetch only the first 12 bytes (enough for all supported signatures).
  // Some CDNs ignore Range and return the full body — we only inspect 12 bytes.
  const response = await fetch(fileUrl, {
    headers: { Range: "bytes=0-11" },
  });
  if (!response.ok) {
    await safeDeleteStorage(ctx, storageId);
    throw new Error("Failed to read uploaded file for validation");
  }

  const buffer = new Uint8Array(await response.arrayBuffer());
  if (buffer.length < 3 || !hasImageMagicBytes(buffer)) {
    await safeDeleteStorage(ctx, storageId);
    throw new Error("Unsupported image format. Please upload PNG or JPEG.");
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
      await safeDeleteStorage(ctx, args.storageId);
      throw new Error("Uploaded file not found in storage");
    }

    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      await safeDeleteStorage(ctx, args.storageId);
      throw new Error("Uploaded file not found in storage");
    }

    await validateImageBlobContent(ctx, args.storageId, url, metadata.size);
    return args.storageId;
  },
});
