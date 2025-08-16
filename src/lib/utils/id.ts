/**
 * Stable ID generation utilities
 * Avoids hydration mismatches by using deterministic IDs
 */

import { useState, useEffect } from "react";
import type { Id } from "../../../convex/_generated/dataModel";

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
 * Runtime type guard for Convex chat ID validation
 * Convex IDs contain a pipe character '|' separator
 * Format: [timestamp]|[unique_id] (e.g., "jh7abc123|456def789")
 */
export function isConvexChatId(id: string): id is Id<"chats"> {
  // Convex IDs always contain a pipe character
  return typeof id === "string" && id.includes("|");
}

/**
 * Runtime type guard for Convex message ID validation
 * Convex IDs contain a pipe character '|' separator
 * Format: [timestamp]|[unique_id] (e.g., "jh7abc123|456def789")
 */
export function isConvexMessageId(id: string): id is Id<"messages"> {
  // Convex IDs always contain a pipe character
  return typeof id === "string" && id.includes("|");
}

/**
 * Generic runtime type guard for any Convex ID validation
 * Convex IDs contain a pipe character '|' separator
 * @param id - The string to validate
 * @returns True if the string is a valid Convex ID format
 */
export function isConvexId(id: string): boolean {
  // Convex IDs always contain a pipe character
  return typeof id === "string" && id.includes("|");
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
