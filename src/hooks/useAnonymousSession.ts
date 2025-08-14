/**
 * Hook to manage anonymous session ID
 * Creates and persists a session ID for unauthenticated users
 * This allows anonymous users to reconnect to their chats
 * Uses UUID v7 for time-sortable, collision-resistant session IDs
 */

import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { uuidv7 } from "uuidv7";

const SESSION_KEY = "searchai:anonymousSessionId";

function generateSessionId(): string {
  return uuidv7();
}

export function useAnonymousSession(): string | null {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [sessionId, setSessionId] = useState<string | null>(() => {
    // Initialize immediately for unauthenticated users
    // This ensures sessionId is available on first render
    if (typeof window === "undefined") return null;

    // If we're still loading auth state, check localStorage
    // to see if we should prepare a session ID
    const existingId = localStorage.getItem(SESSION_KEY);
    if (existingId) return existingId;

    // If no existing ID and not loading, create one immediately
    // This prevents race conditions where repository is created without sessionId
    if (!isLoading && !isAuthenticated) {
      const newId = generateSessionId();
      localStorage.setItem(SESSION_KEY, newId);
      return newId;
    }

    return null;
  });

  useEffect(() => {
    // Skip if auth is still loading
    if (isLoading) return;

    // Only need session ID for unauthenticated users
    if (!isAuthenticated) {
      // Check for existing session ID
      let existingId = localStorage.getItem(SESSION_KEY);

      if (!existingId) {
        // Generate new session ID
        existingId = generateSessionId();
        localStorage.setItem(SESSION_KEY, existingId);
      }

      setSessionId(existingId);
    } else {
      // Clear session ID when authenticated
      setSessionId(null);
      localStorage.removeItem(SESSION_KEY);
    }
  }, [isAuthenticated, isLoading]);

  return sessionId;
}
