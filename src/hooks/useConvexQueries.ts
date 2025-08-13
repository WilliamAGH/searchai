import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

interface UseConvexQueriesProps {
  isAuthenticated: boolean;
  propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  currentChatId: string | null;
}

/**
 * Hook to manage Convex queries for chat data
 */
export function useConvexQueries({
  isAuthenticated,
  propChatId,
  propShareId,
  propPublicId,
  currentChatId: _currentChatId,
}: UseConvexQueriesProps) {
  // Query for chat by opaque ID
  const chatByOpaqueId = useQuery(
    api.chats.getChatByOpaqueId,
    propChatId && isAuthenticated ? { opaqueId: propChatId } : "skip",
  );

  // Query for chat by share ID
  const chatByShareId = useQuery(
    api.chats.getChatByShareId,
    propShareId ? { shareId: propShareId } : "skip",
  );

  // Query for public chat
  const chatByPublicId = useQuery(
    api.chats.getPublicChatById,
    propPublicId ? { publicId: propPublicId } : "skip",
  );

  return {
    chatByOpaqueId,
    chatByShareId,
    chatByPublicId,
  };
}
