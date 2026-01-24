/**
 * Centralized error handling utilities.
 * Eliminates repeated error message extraction patterns across the codebase.
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

/**
 * Standard error messages used across the application.
 * Single source of truth for consistent error messaging.
 */
export const ERROR_MESSAGES = {
  CHAT_NOT_FOUND: "Chat not found",
  CHAT_ACCESS_DENIED: "Chat not found or access denied",
  MESSAGE_NOT_FOUND: "Message not found",
  UNAUTHORIZED: "Unauthorized",
  UNAUTHORIZED_CHAT_ACCESS:
    "Unauthorized: You can only access messages in your own chats",
} as const;
