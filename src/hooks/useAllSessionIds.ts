/**
 * Hook to manage ALL session IDs this browser has used
 * This allows anonymous users to access all their chats across session rotations
 */

import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";

const ALL_SESSIONS_KEY = "searchai:allSessionIds";
const CURRENT_SESSION_KEY = "searchai:anonymousSessionId";

export function useAllSessionIds(): string[] {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [allSessionIds, setAllSessionIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];

    // Get all historical session IDs
    const stored = localStorage.getItem(ALL_SESSIONS_KEY);
    const historical = stored ? JSON.parse(stored) : [];

    // Get current session ID
    const current = localStorage.getItem(CURRENT_SESSION_KEY);

    // Combine and deduplicate
    const combined = current
      ? [...new Set([...historical, current])]
      : historical;

    return combined;
  });

  useEffect(() => {
    // Skip if auth is still loading or user is authenticated
    if (isLoading || isAuthenticated) return;

    // Get current session ID
    const currentSessionId = localStorage.getItem(CURRENT_SESSION_KEY);
    if (!currentSessionId) return;

    // Get all historical session IDs
    const stored = localStorage.getItem(ALL_SESSIONS_KEY);
    const historical = stored ? JSON.parse(stored) : [];

    // Add current to historical if not already there
    if (!historical.includes(currentSessionId)) {
      const updated = [...historical, currentSessionId];
      localStorage.setItem(ALL_SESSIONS_KEY, JSON.stringify(updated));
      setAllSessionIds(updated);
    }
  }, [isAuthenticated, isLoading]);

  // For authenticated users, return empty array (they don't need session IDs)
  if (isAuthenticated) return [];

  return allSessionIds;
}
