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
import { action, mutation, query } from "./_generated/server";
import type { Id } from "./_generated/dataModel";
import { isValidUuidV7 } from "./lib/uuid";

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
    sessionId: v.optional(v.string()),
  },
  returns: v.array(v.union(v.string(), v.null())),
  handler: async (ctx, args) => {
    await requireStorageAccess(ctx, args.sessionId);
    return Promise.all(args.storageIds.map((id) => ctx.storage.getUrl(id)));
  },
});

/**
 * Magic-byte signatures for supported image formats.
 * Each entry checks a primary byte sequence at offset 0, plus an optional
 * secondary sequence at a different offset (needed for RIFF-based WebP).
 */
const IMAGE_SIGNATURES: ReadonlyArray<{
  bytes: readonly number[];
  secondaryOffset?: number;
  secondaryBytes?: readonly number[];
}> = [
  // PNG: \x89PNG
  { bytes: [0x89, 0x50, 0x4e, 0x47] },
  // JPEG: SOI marker + APP marker
  { bytes: [0xff, 0xd8, 0xff] },
  // GIF: GIF8 (covers GIF87a and GIF89a)
  { bytes: [0x47, 0x49, 0x46, 0x38] },
  // WebP: RIFF....WEBP
  {
    bytes: [0x52, 0x49, 0x46, 0x46],
    secondaryOffset: 8,
    secondaryBytes: [0x57, 0x45, 0x42, 0x50],
  },
];

/** Check whether a byte buffer starts with a known image signature. */
export function hasImageMagicBytes(header: Uint8Array): boolean {
  return IMAGE_SIGNATURES.some((sig) => {
    const primary = sig.bytes.every((b, i) => header[i] === b);
    if (!primary) return false;
    if (sig.secondaryOffset !== undefined && sig.secondaryBytes) {
      const offset = sig.secondaryOffset;
      return sig.secondaryBytes.every((b, i) => header[offset + i] === b);
    }
    return true;
  });
}

/** Best-effort cleanup: delete a storage blob without masking the caller's error. */
async function safeDeleteStorage(
  ctx: { storage: { delete: (id: Id<"_storage">) => Promise<void> } },
  storageId: Id<"_storage">,
): Promise<void> {
  try {
    await ctx.storage.delete(storageId);
  } catch (deleteError) {
    console.error("Failed to clean up storage blob", storageId, deleteError);
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
    const url = await ctx.storage.getUrl(args.storageId);
    if (!url) {
      throw new Error("Uploaded file not found in storage");
    }

    // Fetch only the first 12 bytes (enough for all supported signatures)
    const response = await fetch(url, {
      headers: { Range: "bytes=0-11" },
    });

    // Some CDNs ignore Range and return the full body — that's fine,
    // we only inspect the first 12 bytes regardless.
    if (!response.ok) {
      await safeDeleteStorage(ctx, args.storageId);
      throw new Error("Failed to read uploaded file for validation");
    }

    const buffer = new Uint8Array(await response.arrayBuffer());

    if (buffer.length < 3 || !hasImageMagicBytes(buffer)) {
      await safeDeleteStorage(ctx, args.storageId);
      throw new Error(
        "Uploaded file is not a supported image type (PNG, JPEG, GIF, WebP)",
      );
    }

    return args.storageId;
  },
});
