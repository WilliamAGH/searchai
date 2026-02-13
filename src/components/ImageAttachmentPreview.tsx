/**
 * Image Attachment Preview Strip
 *
 * Renders a horizontal strip of image thumbnails above the message textarea.
 * Shows remove buttons on each thumbnail and an upload spinner overlay.
 *
 * @see {@link ../hooks/useImageUpload.ts} State manager for pending images
 */

import type { PendingImage } from "@/hooks/useImageUpload";

interface ImageAttachmentPreviewProps {
  images: PendingImage[];
  onRemove: (index: number) => void;
  isUploading: boolean;
}

export function ImageAttachmentPreview({
  images,
  onRemove,
  isUploading,
}: ImageAttachmentPreviewProps) {
  if (images.length === 0) return null;

  return (
    <div className="flex gap-2 px-3 sm:px-4 pb-2 overflow-x-auto">
      {images.map((img, index) => (
        <div key={img.previewUrl} className="relative flex-shrink-0 group">
          <img
            src={img.previewUrl}
            alt={`Attachment ${index + 1}`}
            className="w-16 h-16 object-cover rounded-lg border border-gray-200 dark:border-gray-700"
          />

          {/* Upload spinner overlay */}
          {isUploading && !img.storageId && (
            <div className="absolute inset-0 bg-black/40 rounded-lg flex items-center justify-center">
              <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
            </div>
          )}

          {/* Remove button */}
          {!isUploading && (
            <button
              type="button"
              onClick={() => onRemove(index)}
              className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 dark:bg-gray-600 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity text-xs leading-none"
              aria-label={`Remove image ${index + 1}`}
            >
              <svg
                className="w-3 h-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
                aria-hidden="true"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M6 18L18 6M6 6l12 12"
                />
              </svg>
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
