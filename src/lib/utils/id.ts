/**
 * Stable ID generation utilities
 * Avoids hydration mismatches by using deterministic IDs
 */

import { useState, useEffect, useId } from "react";

/**
 * Generate a stable ID for component use (SSR-safe)
 * Uses React's built-in useId() which is designed for SSR hydration
 *
 * @example
 * function MyComponent() {
 *   const id = useStableId("input");
 *   return <input id={id} />;
 * }
 */
export function useStableId(prefix: string = "id"): string {
  const reactId = useId();
  return `${prefix}_${reactId}`;
}

/**
 * @deprecated DO NOT USE during SSR/initial render - will cause hydration mismatches
 * Use useStableId() hook instead for SSR-safe IDs
 * Only call this in client-side event handlers or useEffect
 */
export function generateClientOnlyId(prefix: string = "id"): string {
  if (typeof window === "undefined") {
    throw new Error(
      "generateClientOnlyId() cannot be called during SSR. Use useStableId() hook instead.",
    );
  }

  return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
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
