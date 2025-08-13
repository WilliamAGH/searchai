import { useEffect, useRef } from "react";

interface UseAutoCreateFirstChatProps {
  currentChatId: string | null;
  chats: any[];
  isAuthenticated: boolean;
  handleNewChat: () => Promise<string | null>;
}

/**
 * Hook to automatically create first chat if needed
 */
export function useAutoCreateFirstChat({
  currentChatId,
  chats,
  isAuthenticated,
  handleNewChat,
}: UseAutoCreateFirstChatProps) {
  const hasCreatedInitialChatRef = useRef(false);
  const isCreatingRef = useRef(false);

  useEffect(() => {
    // Only create initial chat if:
    // 1. No current chat ID
    // 2. No existing chats
    // 3. Haven't already created one
    // 4. Not currently creating one
    if (
      !currentChatId &&
      chats.length === 0 &&
      !hasCreatedInitialChatRef.current &&
      !isCreatingRef.current
    ) {
      isCreatingRef.current = true;

      handleNewChat()
        .then((newChatId) => {
          if (newChatId) {
            hasCreatedInitialChatRef.current = true;
          }
        })
        .finally(() => {
          isCreatingRef.current = false;
        });
    }
  }, [currentChatId, chats.length, handleNewChat]);

  return {
    isCreatingInitialChat: isCreatingRef.current,
  };
}
