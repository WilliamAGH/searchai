/**
 * Renders image attachments for a message.
 * Resolves Convex storage IDs to serving URLs via the getFileUrl query.
 *
 * @see {@link https://docs.convex.dev/file-storage/serve-files} Convex file serving
 * @see {@link ../../../convex/storage.ts} getFileUrl query
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface MessageImagesProps {
  storageIds: Id<"_storage">[];
}

function ImageThumbnail({ storageId }: { storageId: Id<"_storage"> }) {
  const url = useQuery(api.storage.getFileUrl, {
    storageId,
  });

  if (url === undefined) {
    // Loading state
    return (
      <div className="w-48 h-48 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse" />
    );
  }

  if (url === null) return null; // File was deleted

  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="block">
      <img
        src={url}
        alt="Attachment"
        className="max-w-[300px] max-h-[300px] rounded-lg border border-gray-200 dark:border-gray-700 object-contain cursor-pointer hover:opacity-90 transition-opacity"
        loading="lazy"
      />
    </a>
  );
}

export function MessageImages({ storageIds }: MessageImagesProps) {
  if (storageIds.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2">
      {storageIds.map((id) => (
        <ImageThumbnail key={id} storageId={id} />
      ))}
    </div>
  );
}
