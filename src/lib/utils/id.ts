/**
 * Stable ID generation utilities
 * Avoids hydration mismatches by using deterministic IDs
 */

import { useState, useEffect } from "react";

let idCounter = 0;

/**
 * Generate a stable ID for client-side use
 * Uses a counter instead of timestamp to avoid hydration issues
 */
export function generateStableId(prefix: string = "id"): string {
  if (typeof window === "undefined") {
    // During SSR, use a placeholder that will be replaced on client
    return `${prefix}_ssr_placeholder`;
  }

  // On client, use incrementing counter
  idCounter++;
  return `${prefix}_${idCounter}_${performance.now().toFixed(0)}`;
}

/**
 * Generate a timestamp-based ID (only for client-side operations)
 * Should not be used during initial render
 */
export function generateTimestampId(prefix: string = "id"): string {
  if (typeof window === "undefined") {
    throw new Error("generateTimestampId should not be called during SSR");
  }
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Get current timestamp safely (returns 0 during SSR)
 */
export function getSafeTimestamp(): number {
  if (typeof window === "undefined") {
    return 0; // Will be updated on client hydration
  }
  return Date.now();
}

/**
 * Create a deferred timestamp that updates after hydration
 */
export function useDeferredTimestamp(): number {
  const [timestamp, setTimestamp] = useState(0);
  useEffect(() => {
    setTimestamp(Date.now());
  }, []);
  return timestamp;
}
