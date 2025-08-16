import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { uuidv7 } from "uuidv7";
import { ANON_SESSION_KEY, ALL_SESSIONS_KEY } from "../lib/constants/session";
import { logger } from "../lib/logger";

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
    const existingId = localStorage.getItem(ANON_SESSION_KEY);
    if (existingId) return existingId;

    // If no existing ID and not loading, create one immediately
    // This prevents race conditions where repository is created without sessionId
    if (!isLoading && !isAuthenticated) {
      const newId = generateSessionId();
      localStorage.setItem(ANON_SESSION_KEY, newId);

      // Track all session IDs in historical list
      const stored = localStorage.getItem(ALL_SESSIONS_KEY);
      let historical: string[] = [];
      try {
        historical = stored ? JSON.parse(stored) : [];
        // Ensure it's an array
        if (!Array.isArray(historical)) historical = [];
      } catch {
        // If parsing fails, start with empty array
        historical = [];
      }

      // In development, log session tracking for debugging
      if (import.meta.env.DEV) {
        logger.debug("[SESSION] Adding new session ID to history:", newId);
      }

      if (!historical.includes(newId)) {
        const updated = [...historical, newId];
        localStorage.setItem(ALL_SESSIONS_KEY, JSON.stringify(updated));
      }

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
      let existingId = localStorage.getItem(ANON_SESSION_KEY);

      if (!existingId) {
        // Generate new session ID
        existingId = generateSessionId();
        localStorage.setItem(ANON_SESSION_KEY, existingId);

        // Track all session IDs in historical list
        const stored = localStorage.getItem(ALL_SESSIONS_KEY);
        let historical: string[] = [];
        try {
          historical = stored ? JSON.parse(stored) : [];
          // Ensure it's an array
          if (!Array.isArray(historical)) historical = [];
        } catch {
          // If parsing fails, start with empty array
          historical = [];
        }

        if (!historical.includes(existingId)) {
          const updated = [...historical, existingId];
          localStorage.setItem(ALL_SESSIONS_KEY, JSON.stringify(updated));
          // Note: We don't update the allSessionIds state here as this hook doesn't manage it
        }
      }

      setSessionId(existingId);
      // Expose for debugging in development
      if (
        (import.meta as unknown as { env?: { DEV?: boolean } })?.env?.DEV &&
        typeof window !== "undefined"
      ) {
        (window as unknown as { sessionId?: string }).sessionId = existingId;
      }
    } else {
      // Clear session ID when authenticated
      setSessionId(null);
      localStorage.removeItem(ANON_SESSION_KEY);
    }
  }, [isAuthenticated, isLoading]);

  return sessionId;
}
