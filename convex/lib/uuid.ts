/**
 * UUID v7 Generation Utilities
 *
 * Uses the uuidv7 library for RFC 9562 compliant UUID v7 generation.
 * UUID v7 provides:
 * - Time-sortable IDs (millisecond timestamp embedded)
 * - 74 bits of randomness for collision resistance
 * - Monotonic ordering with 42-bit counter
 * - Cryptographically secure random generation
 *
 * @see https://datatracker.ietf.org/doc/rfc9562/
 */

import { uuidv7 } from "uuidv7";
import { isValidUuidV7 } from "./uuid_validation";

/**
 * Generate a UUID v7 for share IDs
 * Used for shareable chat URLs
 */
export function generateShareId(): string {
  return uuidv7();
}

/**
 * Generate a UUID v7 for public IDs
 * Used for publicly discoverable chat URLs
 */
export function generatePublicId(): string {
  return uuidv7();
}

/**
 * Generate a UUID v7 for session IDs
 * Used for tracking anonymous user sessions
 */
export function generateSessionId(): string {
  return uuidv7();
}

/**
 * Generate a generic UUID v7
 * Backward compatibility wrapper for generateOpaqueId
 */
export function generateOpaqueId(): string {
  return uuidv7();
}

/**
 * Validate if a string is a valid UUID v7
 * UUID v7 format: xxxxxxxx-xxxx-7xxx-yxxx-xxxxxxxxxxxx
 * where y is one of [8, 9, a, b]
 */
export { isValidUuidV7 };

/**
 * Extract timestamp from UUID v7
 * Returns milliseconds since Unix epoch
 */
export function extractTimestampFromUuidV7(id: string): number | null {
  if (!isValidUuidV7(id)) {
    return null;
  }

  // Extract first 48 bits (12 hex chars) which contain the timestamp
  const timestampHex = id.replace(/-/g, "").substring(0, 12);
  return parseInt(timestampHex, 16);
}

/**
 * Compare two UUID v7s chronologically
 * Returns negative if a < b, positive if a > b, 0 if equal
 */
export function compareUuidV7(a: string, b: string): number {
  const timestampA = extractTimestampFromUuidV7(a);
  const timestampB = extractTimestampFromUuidV7(b);

  if (timestampA === null || timestampB === null) {
    // Fall back to string comparison if not valid UUID v7
    return a.localeCompare(b);
  }

  return timestampA - timestampB;
}
