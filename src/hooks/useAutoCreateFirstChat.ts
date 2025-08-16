import { useEffect, useRef } from "react";

interface UseAutoCreateFirstChatProps {
  currentChatId: string | null;
  chats: Array<{ id?: string }>;
  isAuthenticated: boolean;
  handleNewChat: () => Promise<string | null>;
  // Optional guards to avoid premature auto-creation on deep links or in-flight creation
  propChatId?: string | null;
  propShareId?: string | null;
  propPublicId?: string | null;
  isCreatingChat?: boolean;
  allChats?: Array<{ id: string }>;
  userSelectedChatAtRef?: React.MutableRefObject<number | null>;
}

/**
 * Hook to automatically create first chat if needed
 */
export function useAutoCreateFirstChat({
  currentChatId,
  chats,
  isAuthenticated: _isAuthenticated,
  handleNewChat,
  propChatId,
  propShareId,
  propPublicId,
  isCreatingChat,
}: UseAutoCreateFirstChatProps) {
  const hasCreatedInitialChatRef = useRef(false);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    // Only create initial chat if:
    // 1. No current chat ID
    // 2. No existing chats
    // 3. Haven't already created one
    // 4. Not currently creating one
    // 5. No deep-link identifiers present (avoid overriding deep links)
    if (
      !currentChatId &&
      chats.length === 0 &&
      !hasCreatedInitialChatRef.current &&
      !isCreatingRef.current &&
      !isCreatingChat &&
      !propChatId &&
      !propShareId &&
      !propPublicId
    ) {
      isCreatingRef.current = true;

      // Don't return the Promise directly - useEffect expects a cleanup function or undefined
      void handleNewChat()
        .then((newChatId) => {
          if (newChatId) {
            hasCreatedInitialChatRef.current = true;
          }
        })
        .catch(() => {
          // Swallow errors here; UI can prompt user as needed
        })
        .finally(() => {
          isCreatingRef.current = false;
        });
    }
  }, [
    currentChatId,
    chats.length,
    handleNewChat,
    isCreatingChat,
    propChatId,
    propShareId,
    propPublicId,
  ]);

  return {
    isCreatingInitialChat: isCreatingRef.current,
  };
}
