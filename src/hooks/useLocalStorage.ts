import { useCallback, useEffect, useRef, useState } from "react";
import { logger } from "@/lib/logger";

/**
 * LocalStorage hook with debounced persistence.
 *
 * Rationale:
 * - Streaming token updates were triggering dozens of writes/second, which are synchronous
 *   and can freeze/crash Safari on iOS. We debounce writes to reduce contention.
 * - Uses functional state updates to avoid stale-closure bugs when callers pass updater funcs.
 */
export function useLocalStorage<T>(
  key: string,
  initialValue: T,
  options: { debounceMs?: number } = {},
): [T, (value: T | ((prev: T) => T)) => void] {
  const { debounceMs = 500 } = options; // Lower write frequency during streams

  const isCompatible = (value: unknown, fallback: T): value is T => {
    if (value === null || value === undefined) return false;

    const fallbackType = typeof fallback;
    const valueType = typeof value;

    if (Array.isArray(fallback)) {
      return Array.isArray(value);
    }

    if (fallbackType === "object") {
      return valueType === "object";
    }

    return fallbackType === valueType;
  };

  const isUpdater = (value: T | ((prev: T) => T)): value is (prev: T) => T =>
    typeof value === "function";

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      if (!item) return initialValue;
      const parsed: unknown = JSON.parse(item);
      return isCompatible(parsed, initialValue) ? parsed : initialValue;
    } catch (error) {
      logger.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Track latest state for debounced persistence
  const latestRef = useRef(storedValue);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = storedValue;
  }, [storedValue]);

  const persist = useCallback(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(latestRef.current));
    } catch (error) {
      logger.error(`Error setting localStorage key "${key}":`, error);
    }
  }, [key]);

  const schedulePersist = () => {
    if (timerRef.current !== null) {
      window.clearTimeout(timerRef.current);
    }
    timerRef.current = window.setTimeout(persist, debounceMs);
  };

  const setValue = (value: T | ((prev: T) => T)) => {
    setStoredValue((prev) => {
      const next = isUpdater(value) ? value(prev) : value;
      latestRef.current = next;
      schedulePersist();
      return next;
    });
  };

  // Flush pending write on unmount
  useEffect(() => {
    return () => {
      if (timerRef.current !== null) {
        window.clearTimeout(timerRef.current);
        // Best-effort final write
        persist();
      }
    };
  }, [persist]);

  return [storedValue, setValue];
}
