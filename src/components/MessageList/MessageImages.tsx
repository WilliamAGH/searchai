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
import { useAnonymousSession } from "@/hooks/useAnonymousSession";

interface MessageImagesProps {
  storageIds: string[];
  chatId: string;
}

export function MessageImages({ storageIds, chatId }: MessageImagesProps) {
  const sessionId = useAnonymousSession();

  // Single boundary cast: plain strings from Message type → branded Convex Ids
  // Note: Convex query arguments expect branded Ids; the client Message type unwraps
  // these as strings, so we re-cast at the query boundary.
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- boundary cast at Convex query edge
  const typedIds = storageIds as Id<"_storage">[];
  // oxlint-disable-next-line typescript-eslint/no-unsafe-type-assertion -- boundary cast at Convex query edge
  const typedChatId = chatId as Id<"chats">;

  // Hook must be called unconditionally (rules of hooks); use "skip" for empty arrays
  const urls = useQuery(
    api.storage.getFileUrls,
    storageIds.length > 0
      ? {
          storageIds: typedIds,
          chatId: typedChatId,
          sessionId: sessionId ?? undefined,
        }
      : "skip",
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
        if (!url) {
          return (
            <div
              key={storageIds[i]}
              className="w-48 h-48 rounded-lg border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800 flex items-center justify-center"
            >
              <span className="text-xs text-gray-400 dark:text-gray-500">
                Image unavailable
              </span>
            </div>
          );
        }
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
