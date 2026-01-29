/**
 * Performance optimization hooks for rate-limiting function calls
 * Provides debounce and throttle utilities for React components
 */

import { useEffect, useRef, useCallback } from "react";

/**
 * Debounce hook - delays function execution until after wait period
 * Function will only execute after it stops being called for the specified delay
 *
 * Use cases:
 * - Search input handling
 * - Window resize events
 * - Form validation
 *
 * @template T - Function type to debounce
 * @param {T} callback - Function to debounce
 * @param {number} delay - Delay in milliseconds
 * @returns {T} Debounced version of the callback
 */
export function useDebounce<Args extends unknown[]>(
  callback: (...args: Args) => void,
  delay: number,
): (...args: Args) => void {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const debouncedCallback = useCallback(
    (...args: Args) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      timeoutRef.current = setTimeout(() => {
        callbackRef.current(...args);
      }, delay);
    },
    [delay],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return debouncedCallback;
}

/**
 * Throttle hook - limits function execution to once per time period
 * Ensures function runs at most once per specified delay
 *
 * Use cases:
 * - Scroll event handlers
 * - Mouse move tracking
 * - API rate limiting
 *
 * @template T - Function type to throttle
 * @param {T} callback - Function to throttle
 * @param {number} delay - Minimum time between executions in milliseconds
 * @returns {T} Throttled version of the callback
 */
export function useThrottle<T extends (...args: unknown[]) => void>(
  callback: T,
  delay: number,
): T {
  const lastRunRef = useRef<number>(0);
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  const callbackRef = useRef(callback);

  // Update callback ref when callback changes
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);

  const throttledCallback = useCallback<T>(
    (...args: Parameters<T>) => {
      const now = Date.now();
      const timeSinceLastRun = now - lastRunRef.current;

      if (timeSinceLastRun >= delay) {
        callbackRef.current(...args);
        lastRunRef.current = now;
      } else {
        // Schedule a delayed call
        if (timeoutRef.current) {
          clearTimeout(timeoutRef.current);
        }

        timeoutRef.current = setTimeout(() => {
          callbackRef.current(...args);
          lastRunRef.current = Date.now();
        }, delay - timeSinceLastRun);
      }
    },
    [delay],
  );

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return throttledCallback;
}
