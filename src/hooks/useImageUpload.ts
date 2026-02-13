/**
 * Image Upload Hook
 *
 * Manages image attachment state for chat messages using Convex File Storage.
 * Follows the 3-step Convex upload pattern: generateUploadUrl -> POST -> save storageId.
 * Includes server-side magic-byte validation via validateImageUpload action.
 *
 * @see {@link ../../convex/storage.ts} generateUploadUrl mutation + validateImageUpload action
 * @see {@link ./chatActions/sendMessage.ts} Consumer — passes imageStorageIds to backend
 */

import { useState, useCallback, useRef, useEffect } from "react";
import { useAction, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { downscaleImageFile } from "@/lib/images/downscaleImageFile";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg"]);
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB
const MAX_IMAGES = 4;
const MAX_IMAGE_DIMENSION_PX = 2048;

export interface PendingImage {
  file: File;
  previewUrl: string;
  storageId?: string;
}

export interface ImageRejection {
  id: string;
  file: string;
  reason: string;
}

export interface ImageUploadState {
  images: PendingImage[];
  isUploading: boolean;
  rejections: ImageRejection[];
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  dismissRejection: (id: string) => void;
  uploadAll: () => Promise<string[]>;
  clear: () => void;
  hasImages: boolean;
}

interface UploadSingleImageParams {
  file: File;
  generateUploadUrl: (args: { sessionId?: string }) => Promise<string>;
  validateImageUpload: (args: {
    storageId: Id<"_storage">;
    sessionId?: string;
  }) => Promise<Id<"_storage">>;
  sessionId?: string;
}

/** Upload a single image via Convex's 3-step pattern: generateUrl → POST → validate. */
async function uploadSingleImage(
  params: UploadSingleImageParams,
): Promise<string> {
  const uploadFile = await downscaleImageFile({
    file: params.file,
    maxDimensionPx: MAX_IMAGE_DIMENSION_PX,
  });
  if (uploadFile.size > MAX_FILE_SIZE) {
    throw new Error("Processed image exceeds 10 MB limit");
  }

  const uploadUrl = await params.generateUploadUrl({
    sessionId: params.sessionId || undefined,
  });

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": uploadFile.type },
    body: uploadFile,
  });

  if (!response.ok) {
    throw new Error(`Upload failed: ${response.statusText}`);
  }

  const json: unknown = await response.json();
  if (
    typeof json !== "object" ||
    json === null ||
    !("storageId" in json) ||
    typeof json.storageId !== "string"
  ) {
    throw new Error("Unexpected upload response: missing storageId");
  }
  const storageId = json.storageId;

  await params.validateImageUpload({
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Convex branded Id from validated upload response
    storageId: storageId as Id<"_storage">,
    sessionId: params.sessionId || undefined,
  });

  return storageId;
}

export function useImageUpload(sessionId?: string | null): ImageUploadState {
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [rejections, setRejections] = useState<ImageRejection[]>([]);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const validateImageUpload = useAction(api.storage.validateImageUpload);

  // Ref mirror of images state so async callbacks read current values
  const imagesRef = useRef<PendingImage[]>([]);
  imagesRef.current = images;

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set());

  // Fix #1: Revoke all tracked URLs on unmount to prevent memory leaks
  useEffect(() => {
    const urls = objectUrlsRef.current;
    return () => {
      for (const url of urls) {
        URL.revokeObjectURL(url);
      }
      urls.clear();
    };
  }, []);

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  // Fix #2: Use setImages updater to avoid stale closure on images.length
  // Fix #3: Populate rejections for invalid files instead of silently dropping
  const addImages = useCallback((files: File[]) => {
    const newRejections: ImageRejection[] = [];

    setImages((prev) => {
      const valid: PendingImage[] = [];

      for (const file of files) {
        if (!ACCEPTED_TYPES.has(file.type)) {
          newRejections.push({
            id: crypto.randomUUID(),
            file: file.name,
            reason: "Unsupported format (PNG or JPEG only)",
          });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          newRejections.push({
            id: crypto.randomUUID(),
            file: file.name,
            reason: "File exceeds 10 MB limit",
          });
          continue;
        }
        if (prev.length + valid.length >= MAX_IMAGES) {
          newRejections.push({
            id: crypto.randomUUID(),
            file: file.name,
            reason: `Maximum ${MAX_IMAGES} images`,
          });
          continue;
        }

        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        valid.push({ file, previewUrl });
      }

      return valid.length > 0 ? [...prev, ...valid] : prev;
    });

    if (newRejections.length > 0) {
      setRejections((prev) => [...prev, ...newRejections]);
    }
  }, []); // No dependencies — uses setImages updater + ref

  const removeImage = useCallback(
    (index: number) => {
      setImages((prev) => {
        const removed = prev[index];
        if (removed) revokeUrl(removed.previewUrl);
        return prev.filter((_, i) => i !== index);
      });
    },
    [revokeUrl],
  );

  const dismissRejection = useCallback((id: string) => {
    setRejections((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const appendRejections = useCallback(
    (failures: ReadonlyArray<{ file: string; reason: string }>) => {
      setRejections((prev) => [
        ...prev,
        ...failures.map((f) => ({
          id: crypto.randomUUID(),
          file: f.file,
          reason: f.reason,
        })),
      ]);
    },
    [],
  );

  const uploadAll = useCallback(async (): Promise<string[]> => {
    const current = imagesRef.current;
    if (current.length === 0) return [];
    setIsUploading(true);

    try {
      const settled = await Promise.allSettled(
        current.map((img) =>
          img.storageId
            ? Promise.resolve(img.storageId)
            : uploadSingleImage({
                file: img.file,
                generateUploadUrl,
                validateImageUpload,
                sessionId: sessionId ?? undefined,
              }),
        ),
      );

      const successIds: string[] = [];
      const failed: Array<{ file: string; reason: string }> = [];
      for (let i = 0; i < settled.length; i++) {
        const result = settled[i];
        if (result.status === "fulfilled") {
          successIds.push(result.value);
        } else {
          const errorMessage =
            result.reason instanceof Error
              ? result.reason.message
              : "Upload failed";
          failed.push({ file: current[i].file.name, reason: errorMessage });
        }
      }

      if (failed.length > 0 && successIds.length === 0) {
        appendRejections(failed);
        throw new Error(
          "Image upload failed. Review the attachment errors above and try again.",
        );
      }

      // Correlate successful results back to state via stable previewUrl key
      const uploadMap = new Map<string, string>();
      let successIdx = 0;
      for (let i = 0; i < settled.length; i++) {
        if (settled[i].status === "fulfilled") {
          uploadMap.set(current[i].previewUrl, successIds[successIdx]);
          successIdx++;
        }
      }
      setImages((prev) =>
        prev.map((item) => {
          const uploadedId = uploadMap.get(item.previewUrl);
          return uploadedId && !item.storageId
            ? { ...item, storageId: uploadedId }
            : item;
        }),
      );

      if (failed.length > 0) {
        console.warn("[IMAGE_UPLOAD_PARTIAL_FAILURE]", {
          failed: failed.length,
          succeeded: successIds.length,
          total: settled.length,
        });
        appendRejections(failed);
      }

      return successIds;
    } finally {
      setIsUploading(false);
    }
  }, [generateUploadUrl, validateImageUpload, sessionId, appendRejections]);

  const clear = useCallback(() => {
    for (const img of images) {
      revokeUrl(img.previewUrl);
    }
    setImages([]);
    setRejections([]);
  }, [images, revokeUrl]);

  return {
    images,
    isUploading,
    rejections,
    addImages,
    removeImage,
    dismissRejection,
    uploadAll,
    clear,
    hasImages: images.length > 0,
  };
}
