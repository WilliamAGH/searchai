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

    // CRITICAL FIX: Always provide sessionId immediately, even during auth loading
    // This prevents repository creation with undefined sessionId
    const existingId = localStorage.getItem(SESSION_KEY);
    if (existingId) return existingId;

    // Create session ID immediately - don't wait for auth loading to complete
    // Auth loading state will clean it up if user is authenticated
    const newId = generateSessionId();
    localStorage.setItem(SESSION_KEY, newId);
    return newId;
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
