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
  isAuthenticated: _isAuthenticated,
}: UseUrlStateSyncProps) {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const isChatRoute =
      location.pathname === "/" ||
      location.pathname === "/chat" ||
      location.pathname.startsWith("/chat/");

    // Only sync if we're already on a chat route and the URL doesn't match
    if (currentChatId && isChatRoute) {
      const expectedPath = `/chat/${currentChatId}`;
      if (location.pathname !== expectedPath) {
        navigate(expectedPath, { replace: true });
      }
      return;
    }

    // If no chat ID but we're on a chat route, go home
    if (!currentChatId && isChatRoute && location.pathname !== "/") {
      navigate("/", { replace: true });
    }
  }, [currentChatId, location.pathname, navigate]);
}
