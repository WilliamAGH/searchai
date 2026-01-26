/**
 * Error Boundary Component
 * Catches JavaScript errors anywhere in the child component tree
 * Logs error information and displays a fallback UI
 * Essential for production stability and user experience
 */

import React, { Component, ReactNode } from "react";
import { logger } from "@/lib/logger";

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
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null, errorInfo: null };
  }

  /**
   * Update state when an error is caught
   * Called during the render phase
   *
   * @param {Error} error - The error that was thrown
   * @returns {State} New state with error information
   */
  static getDerivedStateFromError(error: Error): State {
    // Update state so the next render will show the fallback UI
    return { hasError: true, error, errorInfo: null };
  }

  /**
   * Log error details and call custom error handler
   * Called after an error has been thrown
   *
   * @param {Error} error - The error that was thrown
   * @param {React.ErrorInfo} errorInfo - React error information
   */
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error details for debugging
    logger.error("❌ ErrorBoundary caught error:", {
      error: error.toString(),
      stack: error.stack,
      componentStack: errorInfo.componentStack,
    });
    logger.error("Error caught by boundary:", error, errorInfo);

    // Call custom error handler if provided
    if (this.props.onError) {
      this.props.onError(error, errorInfo);
    }

    // Update state with error info
    this.setState({
      errorInfo,
    });
  }

  /**
   * Reset error state and navigate to home page
   * Provides a way for users to recover from errors
   */
  handleReset = () => {
    this.setState({ hasError: false, error: null, errorInfo: null });
    // Try to navigate back to home
    window.location.href = "/";
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI if provided
      if (this.props.fallback) {
        return <>{this.props.fallback}</>;
      }

      // Default error UI
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
                onClick={this.handleReset}
                className="flex-1 px-4 py-2 bg-emerald-500 text-white rounded-lg hover:bg-emerald-600 transition-colors"
              >
                Go to Home
              </button>
              <button
                onClick={() => window.location.reload()}
                className="flex-1 px-4 py-2 bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
              >
                Reload Page
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
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
