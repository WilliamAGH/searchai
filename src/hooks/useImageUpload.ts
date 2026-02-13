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

const ACCEPTED_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/gif",
  "image/webp",
]);
const MAX_FILE_SIZE = 20 * 1024 * 1024; // 20 MB
const MAX_IMAGES = 4;

export interface PendingImage {
  file: File;
  previewUrl: string;
  storageId?: string;
}

export interface ImageRejection {
  file: string;
  reason: string;
}

export interface ImageUploadState {
  images: PendingImage[];
  isUploading: boolean;
  rejections: ImageRejection[];
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  dismissRejection: (index: number) => void;
  uploadAll: () => Promise<string[]>;
  clear: () => void;
  hasImages: boolean;
}

/** Upload a single image via Convex's 3-step pattern: generateUrl → POST → validate. */
async function uploadSingleImage(
  file: File,
  generateUploadUrl: (args: { sessionId?: string }) => Promise<string>,
  validateImageUpload: (args: { storageId: Id<"_storage"> }) => Promise<void>,
  sessionId?: string,
): Promise<string> {
  const uploadUrl = await generateUploadUrl({
    sessionId: sessionId || undefined,
  });

  const response = await fetch(uploadUrl, {
    method: "POST",
    headers: { "Content-Type": file.type },
    body: file,
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

  await validateImageUpload({
    // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Convex branded Id from validated upload response
    storageId: storageId as Id<"_storage">,
  });

  return storageId;
}

export function useImageUpload(sessionId?: string | null): ImageUploadState {
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const [rejections, setRejections] = useState<ImageRejection[]>([]);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const validateImageUpload = useAction(api.storage.validateImageUpload);

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
            file: file.name,
            reason: `Unsupported type: ${file.type}`,
          });
          continue;
        }
        if (file.size > MAX_FILE_SIZE) {
          newRejections.push({
            file: file.name,
            reason: "File exceeds 20 MB limit",
          });
          continue;
        }
        if (prev.length + valid.length >= MAX_IMAGES) {
          newRejections.push({
            file: file.name,
            reason: `Maximum ${MAX_IMAGES} images`,
          });
          break;
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

  const dismissRejection = useCallback((index: number) => {
    setRejections((prev) => prev.filter((_, i) => i !== index));
  }, []);

  const uploadAll = useCallback(async (): Promise<string[]> => {
    const current = images;
    if (current.length === 0) return [];
    setIsUploading(true);

    try {
      const results = await Promise.all(
        current.map((img) =>
          img.storageId
            ? Promise.resolve(img.storageId)
            : uploadSingleImage(
                img.file,
                generateUploadUrl,
                validateImageUpload,
                sessionId ?? undefined,
              ),
        ),
      );

      // Correlate results back to state via stable previewUrl key
      const uploadMap = new Map(
        current.map((img, i) => [img.previewUrl, results[i]]),
      );
      setImages((prev) =>
        prev.map((item) => {
          const uploadedId = uploadMap.get(item.previewUrl);
          return uploadedId && !item.storageId
            ? { ...item, storageId: uploadedId }
            : item;
        }),
      );

      return results;
    } catch (error) {
      throw error instanceof Error ? error : new Error("Image upload failed");
    } finally {
      setIsUploading(false);
    }
  }, [images, generateUploadUrl, validateImageUpload, sessionId]);

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
