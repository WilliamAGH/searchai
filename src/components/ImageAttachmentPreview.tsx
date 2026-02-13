/**
 * Image Attachment Preview Strip
 *
 * Renders a horizontal strip of image thumbnails above the message textarea.
 * Shows remove buttons on each thumbnail and an upload spinner overlay.
 * Displays rejection banners when files fail validation.
 *
 * @see {@link ../hooks/useImageUpload.ts} State manager for pending images
 */

import { useEffect, useRef } from "react";
import type { PendingImage, ImageRejection } from "@/hooks/useImageUpload";

const AUTO_DISMISS_MS = 5000;

interface ImageAttachmentPreviewProps {
  images: PendingImage[];
  onRemove: (index: number) => void;
  isUploading: boolean;
  rejections?: ImageRejection[];
  onDismissRejection?: (id: string) => void;
}

export function ImageAttachmentPreview({
  images,
  onRemove,
  isUploading,
  rejections,
  onDismissRejection,
}: ImageAttachmentPreviewProps) {
  const hasContent = images.length > 0 || (rejections && rejections.length > 0);
  if (!hasContent) return null;

  return (
    <div className="px-3 sm:px-4 pb-2">
      {/* Rejection banners */}
      {rejections && rejections.length > 0 && onDismissRejection && (
        <div className="flex flex-col gap-1 mb-2">
          {rejections.map((r) => (
            <RejectionBanner
              key={r.id}
              rejection={r}
              onDismiss={onDismissRejection}
            />
          ))}
        </div>
      )}

      {/* Thumbnail strip */}
      {images.length > 0 && (
        <div className="flex gap-2 overflow-x-auto">
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

              {/* Remove button — always visible on mobile, hover-only on desktop */}
              {!isUploading && (
                <button
                  type="button"
                  onClick={() => onRemove(index)}
                  className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-gray-800 dark:bg-gray-600 text-white rounded-full flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity text-xs leading-none"
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
      )}
    </div>
  );
}

function RejectionBanner({
  rejection,
  onDismiss,
}: {
  rejection: ImageRejection;
  onDismiss: (id: string) => void;
}) {
  const timerRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    timerRef.current = setTimeout(
      () => onDismiss(rejection.id),
      AUTO_DISMISS_MS,
    );
    return () => clearTimeout(timerRef.current);
  }, [rejection.id, onDismiss]);

  return (
    <div className="flex items-center justify-between gap-2 px-3 py-1.5 text-xs bg-red-50 dark:bg-red-950/30 text-red-700 dark:text-red-300 rounded-lg">
      <span className="truncate">
        <span className="font-medium">{rejection.file}:</span>{" "}
        {rejection.reason}
      </span>
      <button
        type="button"
        onClick={() => onDismiss(rejection.id)}
        className="flex-shrink-0 text-red-500 hover:text-red-700 dark:hover:text-red-200"
        aria-label="Dismiss"
      >
        <svg
          className="w-3.5 h-3.5"
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
    </div>
  );
}
