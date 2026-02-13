/**
 * Renders image attachments for a message.
 * Uses batch getFileUrls query to resolve all storage IDs in a single subscription.
 *
 * @see {@link https://docs.convex.dev/file-storage/serve-files} Convex file serving
 * @see {@link ../../../convex/storage.ts} getFileUrls batch query
 */

import { useQuery } from "convex/react";
import { api } from "../../../convex/_generated/api";
import type { Id } from "../../../convex/_generated/dataModel";

interface MessageImagesProps {
  storageIds: string[];
}

export function MessageImages({ storageIds }: MessageImagesProps) {
  // Single boundary cast: plain strings from Message type → branded Convex Ids
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- boundary cast at Convex query edge, same pattern as aiAgent_utils.ts
  const typedIds = storageIds as Id<"_storage">[];

  // Hook must be called unconditionally (rules of hooks); use "skip" for empty arrays
  const urls = useQuery(
    api.storage.getFileUrls,
    storageIds.length > 0 ? { storageIds: typedIds } : "skip",
  );

  if (storageIds.length === 0) return null;

  if (urls === undefined) {
    return (
      <div className="flex flex-wrap gap-2">
        {storageIds.map((id) => (
          <div
            key={id}
            className="w-48 h-48 rounded-lg bg-gray-100 dark:bg-gray-800 animate-pulse"
          />
        ))}
      </div>
    );
  }

  return (
    <div className="flex flex-wrap gap-2">
      {urls.map((url, i) => {
        if (!url) return null;
        return (
          <a
            key={storageIds[i]}
            href={url}
            target="_blank"
            rel="noopener noreferrer"
            className="block"
          >
            <img
              src={url}
              alt="Attachment"
              className="max-w-[300px] max-h-[300px] rounded-lg border border-gray-200 dark:border-gray-700 object-contain cursor-pointer hover:opacity-90 transition-opacity"
              loading="lazy"
            />
          </a>
        );
      })}
    </div>
  );
}
