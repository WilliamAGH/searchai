/**
 * Standardized error state constants and interfaces
 * Provides consistent error handling patterns across the application
 */

/**
 * Standard error state props interface
 * Used by all error components for consistency
 */
export interface ErrorStateProps {
  /** The error object */
  error?: Error | null;
  /** Retry callback function */
  onRetry?: () => void;
  /** Number of retry attempts made */
  retryCount?: number;
  /** Maximum number of retries allowed */
  maxRetries?: number;
  /** Custom error message to display */
  message?: string;
  /** Show technical error details */
  showDetails?: boolean;
  /** Additional CSS classes */
  className?: string;
}

/**
 * Standard error messages
 */
export const ErrorMessages = {
  GENERIC: "Something went wrong",
  LOAD_FAILED: "Failed to load content",
  MESSAGES_FAILED: "Failed to load messages",
  CHAT_FAILED: "Failed to load chat",
  NETWORK_ERROR: "Network error occurred",
  PERMISSION_DENIED: "Permission denied",
  NOT_FOUND: "Content not found",
  TIMEOUT: "Request timed out",
  RETRY_EXHAUSTED: "Maximum retries reached",
} as const;

/**
 * Retry configuration
 */
export const RetryConfig = {
  DEFAULT_MAX_RETRIES: 3,
  RETRY_DELAY_MS: 1000,
  BACKOFF_MULTIPLIER: 2,
} as const;

/**
 * Error recovery strategies
 */
export const RecoveryStrategies = {
  RETRY: "retry",
  RELOAD: "reload",
  NAVIGATE_HOME: "navigate_home",
  DISMISS: "dismiss",
} as const;

/**
 * Get user-friendly error message from error object
 */
export function getErrorMessage(error: Error | null | undefined): string {
  if (!error) return ErrorMessages.GENERIC;
  
  // Check for common error types
  if (error.message.includes("network") || error.message.includes("fetch")) {
    return ErrorMessages.NETWORK_ERROR;
  }
  if (error.message.includes("timeout")) {
    return ErrorMessages.TIMEOUT;
  }
  if (error.message.includes("permission") || error.message.includes("denied")) {
    return ErrorMessages.PERMISSION_DENIED;
  }
  if (error.message.includes("not found") || error.message.includes("404")) {
    return ErrorMessages.NOT_FOUND;
  }
  
  // Return original message if it's user-friendly, otherwise generic
  return error.message.length < 100 ? error.message : ErrorMessages.GENERIC;
}

/**
 * Calculate retry delay with exponential backoff
 */
export function getRetryDelay(retryCount: number): number {
  return RetryConfig.RETRY_DELAY_MS * Math.pow(RetryConfig.BACKOFF_MULTIPLIER, retryCount);
}

/**
 * Check if we should retry based on error type and retry count
 */
export function shouldRetry(error: Error | null, retryCount: number, maxRetries?: number): boolean {
  const max = maxRetries ?? RetryConfig.DEFAULT_MAX_RETRIES;
  
  if (retryCount >= max) return false;
  if (!error) return false;
  
  // Don't retry on permission or not found errors
  const message = error.message.toLowerCase();
  if (message.includes("permission") || message.includes("denied") || message.includes("404")) {
    return false;
  }
  
  return true;
}