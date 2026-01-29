/**
 * UUID v7 Utilities for Frontend
 *
 * Provides UUID v7 generation and validation for the frontend.
 * UUID v7 benefits:
 * - Time-sortable (chronological ordering)
 * - Collision-resistant (74 bits of randomness)
 * - RFC 9562 compliant
 * - Better indexing performance than random UUIDs
 */

import { uuidv7 } from "uuidv7";

/**
 * Generate a UUID v7
 */
export function generateUuidV7(): string {
  return uuidv7();
}

/**
 * Validate if a string is a valid UUID v7
 * UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where y is one of [8, 9, a, b]
 */
export function isValidUuidV7(id: string): boolean {
  const uuidV7Pattern = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  return uuidV7Pattern.test(id);
}

/**
 * Extract timestamp from UUID v7
 * Returns Date object or null if invalid
 */
export function getTimestampFromUuidV7(id: string): Date | null {
  if (!isValidUuidV7(id)) {
    return null;
  }

  // Extract first 48 bits (12 hex chars) which contain the timestamp
  const timestampHex = id.replace(/-/g, "").substring(0, 12);
  const timestamp = parseInt(timestampHex, 16);
  return new Date(timestamp);
}

/**
 * Check if a UUID v7 was generated within a time range
 */
export function isUuidV7InTimeRange(id: string, startDate: Date, endDate: Date): boolean {
  const timestamp = getTimestampFromUuidV7(id);
  if (!timestamp) return false;

  return timestamp >= startDate && timestamp <= endDate;
}

/**
 * Sort an array of UUID v7s chronologically
 */
export function sortUuidV7Chronologically(ids: string[], order: "asc" | "desc" = "asc"): string[] {
  return [...ids].sort((a, b) => {
    const timeA = getTimestampFromUuidV7(a);
    const timeB = getTimestampFromUuidV7(b);

    if (!timeA || !timeB) {
      return a.localeCompare(b);
    }

    const diff = timeA.getTime() - timeB.getTime();
    return order === "asc" ? diff : -diff;
  });
}
