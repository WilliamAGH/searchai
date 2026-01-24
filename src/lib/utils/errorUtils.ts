/**
 * Centralized error handling utilities for frontend.
 * @see {@link convex/lib/errors.ts} - Backend equivalent
 */

/**
 * Extract error message from unknown error type.
 * Replaces the repeated pattern: `error instanceof Error ? error.message : "Unknown error"`
 *
 * @param error - Unknown error value (typically from catch block)
 * @param fallback - Fallback message if error is not an Error instance
 * @returns Error message string
 *
 * @example
 * try {
 *   await riskyOperation();
 * } catch (e) {
 *   console.error("Operation failed:", getErrorMessage(e));
 * }
 */
export function getErrorMessage(
  error: unknown,
  fallback = "Unknown error",
): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return fallback;
}
