import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface UseConvexQueriesProps {
  propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  sessionId?: string;
}

/**
 * Hook to manage Convex queries for chat resolution by various ID types
 */
export function useConvexQueries({
  propChatId,
  propShareId,
  propPublicId,
  sessionId,
}: UseConvexQueriesProps) {
  // Query for chat by opaque ID
  const chatByOpaqueId = useQuery(
    api.chats.getChatByOpaqueId,
    propChatId
      ? { opaqueId: propChatId, sessionId: sessionId || undefined }
      : "skip",
  );

  // Query for chat by share ID
  const chatByShareId = useQuery(
    api.chats.getChatByShareId,
    propShareId ? { shareId: propShareId } : "skip",
  );

  // Query for public chat
  const chatByPublicId = useQuery(
    api.chats.getChatByPublicId,
    propPublicId ? { publicId: propPublicId } : "skip",
  );

  return {
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
  };
}
