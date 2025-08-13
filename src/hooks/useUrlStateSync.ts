import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";

interface UseUrlStateSyncProps {
  currentChatId: string | null;
  isAuthenticated: boolean;
}

/**
 * Hook to sync URL state with current chat
 */
export function useUrlStateSync({
  currentChatId,
  isAuthenticated,
}: UseUrlStateSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    // Only sync if we have a chat ID and the URL doesn't already match
    if (currentChatId) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
    } else if (location.pathname !== "/" && location.pathname !== "/chat") {
      // If no chat ID but we're on a chat route, go home
      navigate("/", { replace: true });
    }
  }, [currentChatId, location.pathname, navigate]);
}
