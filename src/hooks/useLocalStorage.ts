import { useEffect, useRef, useState } from "react";

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

  const [storedValue, setStoredValue] = useState<T>(() => {
    try {
      const item = window.localStorage.getItem(key);
      return item ? (JSON.parse(item) as T) : initialValue;
    } catch (error) {
      console.error(`Error reading localStorage key "${key}":`, error);
      return initialValue;
    }
  });

  // Track latest state for debounced persistence
  const latestRef = useRef(storedValue);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    latestRef.current = storedValue;
  }, [storedValue]);

  const persist = React.useCallback(() => {
    try {
      window.localStorage.setItem(key, JSON.stringify(latestRef.current));
    } catch (error) {
      console.error(`Error setting localStorage key "${key}":`, error);
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
      const next =
        value instanceof Function ? (value as (p: T) => T)(prev) : (value as T);
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
