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
 * Convex IDs are 32-33 character strings that:
 * - Start with 'j'
 * - Contain only lowercase letters and numbers
 * Examples: jx7e5gwa92qprwdghxk0rzgmm57nrxsc, jx7042axq42zkrpd9768ycfs417nrk2f
 */
export function isConvexChatId(id: string): id is Id<"chats"> {
  // Convex IDs start with 'j' and are 32-33 chars of alphanumeric
  return (
    typeof id === "string" &&
    id.length >= 32 &&
    id.length <= 33 &&
    id.startsWith("j") &&
    /^[a-z0-9]+$/.test(id)
  );
}

/**
 * Runtime type guard for Convex message ID validation
 * Convex IDs are 32-33 character strings that:
 * - Start with 'j'
 * - Contain only lowercase letters and numbers
 */
export function isConvexMessageId(id: string): id is Id<"messages"> {
  // Convex IDs start with 'j' and are 32-33 chars of alphanumeric
  return (
    typeof id === "string" &&
    id.length >= 32 &&
    id.length <= 33 &&
    id.startsWith("j") &&
    /^[a-z0-9]+$/.test(id)
  );
}

/**
 * Generic runtime type guard for any Convex ID validation
 * Convex IDs are 32-33 character strings that:
 * - Start with 'j'
 * - Contain only lowercase letters and numbers
 * @param id - The string to validate
 * @returns True if the string is a valid Convex ID format
 */
export function isConvexId(id: string): boolean {
  // Convex IDs start with 'j' and are 32-33 chars of alphanumeric
  return (
    typeof id === "string" &&
    id.length >= 32 &&
    id.length <= 33 &&
    id.startsWith("j") &&
    /^[a-z0-9]+$/.test(id)
  );
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
