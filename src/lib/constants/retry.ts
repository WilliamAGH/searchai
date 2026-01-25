/**
 * Retry and backoff constants for network operations.
 * Used by ConvexChatRepository and other async operations requiring retry logic.
 */

/** Base delay in milliseconds for exponential backoff (fast retries for DB lookups) */
export const FAST_RETRY_BASE_MS = 50;

/** Maximum retry attempts for post-creation lookups */
export const MAX_LOOKUP_RETRIES = 5;

/**
 * Compute exponential backoff delay.
 * @param attempt - Zero-indexed attempt number
 * @param baseMs - Base delay in milliseconds (default: FAST_RETRY_BASE_MS)
 * @returns Delay in milliseconds: base * 2^attempt (e.g., 50ms, 100ms, 200ms, 400ms)
 */
export function computeFastBackoff(
  attempt: number,
  baseMs = FAST_RETRY_BASE_MS,
): number {
  return baseMs * Math.pow(2, attempt);
}
