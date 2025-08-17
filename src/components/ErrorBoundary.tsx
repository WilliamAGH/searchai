/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Logs error information and displays a fallback UI
 * Essential for production stability and user experience
 */

import type { ReactNode } from "react";
import React, { Component } from "react";
import { logger } from "../lib/logger";

/**
 * Props for the ErrorBoundary component
 * @interface Props
 */
interface Props {
  /** Child components to be wrapped by the error boundary */
  children: ReactNode;
  /** Optional custom fallback UI to display on error */
  fallback?: ReactNode;
  /** Optional error handler callback for custom error processing */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
  /** Keys that trigger a reset when changed */
  resetKeys?: Array<string | number>;
  /** Reset error boundary when props change */
  resetOnPropsChange?: boolean;
  /** Don't crash parent components */
  isolate?: boolean;
  /** Error boundary level for logging and display */
  level?: 'page' | 'section' | 'component';
}

/**
 * Internal state for error boundary
 * @interface State
 */
interface State {
  /** Flag indicating if an error has been caught */
  hasError: boolean;
  /** The caught error object, null if no error */
  error: Error | null;
  /** React error info including component stack */
  errorInfo: React.ErrorInfo | null;
  /** Count of errors caught (for circuit breaker pattern) */
  errorCount: number;
  /** Track auto-retry attempts */
  retryCount: number;
}

/**
 * ErrorBoundary component class
 *
 * Features:
 * - Catches JavaScript errors in child components
 * - Logs errors for debugging
 * - Displays user-friendly error UI
 * - Provides recovery options (reset, reload)
 * - Supports custom fallback UI
 *
 * @class ErrorBoundary
 * @extends {Component<Props, State>}
 */
export class ErrorBoundary extends Component<Props, State> {
  private resetTimeoutId: number | null = null;
  private previousResetKeys: Array<string | number> = [];
  private retryTimeoutId: number | null = null;

  constructor(props: Props) {
    super(props);
    this.state = { 
      hasError: false, 
      error: null, 
      errorInfo: null,
      errorCount: 0,
      retryCount: 0,
    };
  }

  /**
   * Update state when an error is caught
   * Called during the render phase
   *
   * @param {Error} error - The error that was thrown
   * @returns {Partial<State>} New state with error information
   */
  static getDerivedStateFromError(error: Error): Partial<State> {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error };
  }

  /**
   * Log error details and call custom error handler
   * Called after an error has been thrown
   *
   * @param {Error} error - The error that was thrown
   * @param {React.ErrorInfo} errorInfo - React error information
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    const { onError, level = 'component' } = this.props;
    
    // Track error count for circuit breaker pattern
    this.setState(prev => ({
      errorInfo,
      errorCount: prev.errorCount + 1,
    }));

    // Log error details for debugging
    logger.error(`❌ ErrorBoundary caught error at ${level} level:`, {
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
      errorCount: this.state.errorCount + 1,
      level,
    });

    // Call custom error handler if provided
    onError?.(error, errorInfo);

    // Auto-retry logic for first 3 errors
    if (this.state.errorCount < 3 && !this.props.isolate) {
      logger.info(`🔄 Auto-retrying in 5 seconds (attempt ${this.state.retryCount + 1}/3)`);
      
      this.retryTimeoutId = window.setTimeout(() => {
        this.setState(prev => ({
          hasError: false,
          error: null,
          errorInfo: null,
          retryCount: prev.retryCount + 1,
        }));
      }, 5000);
    }

    // Send to error tracking service (if configured)
    if (typeof window !== 'undefined' && 'gtag' in window) {
      const w = window as unknown as { gtag: (...args: unknown[]) => void };
      w.gtag('event', 'exception', {
        description: error.message,
        fatal: level === 'page',
        error_count: this.state.errorCount + 1,
      });
    }
  }

  componentDidUpdate(prevProps: Props) {
    const { resetKeys, resetOnPropsChange } = this.props;
    
    // Reset on prop changes if requested
    if (resetOnPropsChange && prevProps.children !== this.props.children) {
      this.resetErrorBoundary();
      return;
    }

    // Reset on resetKeys change
    if (resetKeys && resetKeys !== this.previousResetKeys) {
      if (resetKeys.some((key, idx) => key !== this.previousResetKeys[idx])) {
        this.resetErrorBoundary();
        this.previousResetKeys = resetKeys;
      }
    }
  }

  componentWillUnmount() {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
    }
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
    }
  }

  /**
   * Reset error state without navigation
   * Provides a way for users to recover from errors
   */
  resetErrorBoundary = () => {
    if (this.resetTimeoutId) {
      clearTimeout(this.resetTimeoutId);
      this.resetTimeoutId = null;
    }
    if (this.retryTimeoutId) {
      clearTimeout(this.retryTimeoutId);
      this.retryTimeoutId = null;
    }

    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
      retryCount: 0,
      // Don't reset errorCount to track total errors
    });
  };

  /**
   * Reset error state and navigate to home page
   * Provides a way for users to recover from errors
   */
  handleReset = () => {
    this.resetErrorBoundary();
    // Try to navigate back to home
    window.location.href = "/";
  };

  render() {
    const { hasError, error, errorCount, retryCount } = this.state;
    const { fallback, children } = this.props;

    if (hasError && error) {
      // Circuit breaker: After 5 errors, show permanent error
      if (errorCount > 5) {
        return (
          <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
            <div className="max-w-md w-full bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
              <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
                Too many errors occurred
              </h3>
              <p className="text-red-700 dark:text-red-300 mb-4">
                The application encountered multiple errors and cannot recover automatically.
                Please refresh the page to try again.
              </p>
              <button
                onClick={() => window.location.reload()}
                className="w-full px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
              >
                Refresh Page
              </button>
            </div>
          </div>
        );
      }

      // Custom fallback UI if provided
      if (fallback) {
        return <>{fallback}</>;
      }

      // Default error UI with retry information
      return (
        <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900 px-4">
          <div className="max-w-md w-full bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
            <div className="flex items-center mb-4">
              <svg
                className="w-8 h-8 text-red-500 mr-3"
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  strokeWidth={2}
                  d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                />
              </svg>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Something went wrong
              </h2>
            </div>

            <p className="text-gray-600 dark:text-gray-400 mb-4">
              An unexpected error occurred. This might be a temporary issue with
              navigation or chat creation.
              {retryCount > 0 && (
                <span className="block mt-2 text-sm">
                  Retry attempt {retryCount} of 3
                </span>
              )}
              {errorCount > 1 && (
                <span className="block mt-1 text-sm text-red-600 dark:text-red-400">
                  Total errors in this session: {errorCount}
                </span>
              )}
            </p>

            {this.state.error && (
              <details className="mb-4">
                <summary className="cursor-pointer text-sm text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300">
                  Error details
                </summary>
                <pre className="mt-2 text-xs bg-gray-100 dark:bg-gray-700 p-2 rounded overflow-x-auto">
                  {this.state.error.toString()}
                  {this.state.error.stack && (
                    <>
                      {"\n\nStack trace:\n"}
                      {this.state.error.stack}
                    </>
                  )}
                </pre>
              </details>
            )}

            <div className="flex gap-3">
              <button
                onClick={this.resetErrorBoundary}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
              >
                Try Again
              </button>
              <button
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                Go to Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Reload
              </button>
            </div>
          </div>
        </div>
      );
    }

    return children;
  }
}

/**
 * Hook for functional components to trigger error boundary reset
 * Forces a re-render which can help recover from certain errors
 *
 * @returns {Function} Reset function to trigger re-render
 */
export function useErrorReset() {
  const [, forceUpdate] = React.useReducer((x) => x + 1, 0);
  return () => forceUpdate();
}
