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

import { useState, useCallback, useRef } from "react";
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

export interface ImageUploadState {
  images: PendingImage[];
  isUploading: boolean;
  addImages: (files: File[]) => void;
  removeImage: (index: number) => void;
  uploadAll: () => Promise<string[]>;
  clear: () => void;
  hasImages: boolean;
}

export function useImageUpload(sessionId?: string | null): ImageUploadState {
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isUploading, setIsUploading] = useState(false);
  const generateUploadUrl = useMutation(api.storage.generateUploadUrl);
  const validateImageUpload = useAction(api.storage.validateImageUpload);

  // Track object URLs for cleanup
  const objectUrlsRef = useRef<Set<string>>(new Set());

  const revokeUrl = useCallback((url: string) => {
    URL.revokeObjectURL(url);
    objectUrlsRef.current.delete(url);
  }, []);

  const addImages = useCallback(
    (files: File[]) => {
      const valid: PendingImage[] = [];
      for (const file of files) {
        if (!ACCEPTED_TYPES.has(file.type)) continue;
        if (file.size > MAX_FILE_SIZE) continue;
        if (images.length + valid.length >= MAX_IMAGES) break;

        const previewUrl = URL.createObjectURL(file);
        objectUrlsRef.current.add(previewUrl);
        valid.push({ file, previewUrl });
      }
      if (valid.length > 0) {
        setImages((prev) => [...prev, ...valid].slice(0, MAX_IMAGES));
      }
    },
    [images.length],
  );

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

  const uploadAll = useCallback(async (): Promise<string[]> => {
    if (images.length === 0) return [];
    setIsUploading(true);

    try {
      const uploaded: string[] = [];

      for (const img of images) {
        if (img.storageId) {
          uploaded.push(img.storageId);
          continue;
        }

        // 1. Get auth-gated upload URL
        const uploadUrl = await generateUploadUrl({
          sessionId: sessionId || undefined,
        });

        // 2. POST the file to Convex storage
        const response = await fetch(uploadUrl, {
          method: "POST",
          headers: { "Content-Type": img.file.type },
          body: img.file,
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

        // 3. Server-side magic-byte validation (deletes file if not a real image)
        await validateImageUpload({
          // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- Convex branded Id from validated upload response
          storageId: storageId as Id<"_storage">,
        });

        img.storageId = storageId;
        uploaded.push(storageId);
      }

      return uploaded;
    } catch (error) {
      // Clean up any partially-uploaded images that weren't validated
      // Re-throw so the caller (MessageInput) can surface the error to the user
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
  }, [images, revokeUrl]);

  return {
    images,
    isUploading,
    addImages,
    removeImage,
    uploadAll,
    clear,
    hasImages: images.length > 0,
  };
}
