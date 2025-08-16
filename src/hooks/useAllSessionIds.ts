import { useEffect, useState } from "react";
import { useConvexAuth } from "convex/react";
import { ALL_SESSIONS_KEY, ANON_SESSION_KEY } from "../lib/constants/session";

export function useAllSessionIds(): string[] {
  const { isAuthenticated, isLoading } = useConvexAuth();
  const [allSessionIds, setAllSessionIds] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];

    // Get all historical session IDs
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

    // Get current session ID
    const current = localStorage.getItem(ANON_SESSION_KEY);

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
    const currentSessionId = localStorage.getItem(ANON_SESSION_KEY);
    if (!currentSessionId) return;

    // Get all historical session IDs
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
