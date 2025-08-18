/**
 * Input Activity Context
 *
 * Tracks whether text input is currently active to prevent
 * disruptive operations during typing. This prevents:
 * - Repository switching while typing
 * - Migration processes during input
 * - Auth state changes from interfering with input
 *
 * Critical for iOS Safari keyboard stability.
 */

import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from "react";

interface InputActivityContextValue {
  /** Whether any text input is currently active/focused */
  isInputActive: boolean;
  /** Register that input has become active */
  setInputActive: () => void;
  /** Register that input has become inactive */
  setInputInactive: () => void;
  /** Execute a callback when input becomes inactive (or immediately if already inactive) */
  whenInputInactive: (callback: () => void) => void;
}

const InputActivityContext = createContext<InputActivityContextValue | null>(
  null,
);

export function InputActivityProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [isInputActive, setIsInputActive] = useState(false);
  const pendingCallbacks = useRef<Array<() => void>>([]);

  const setInputActive = useCallback(() => {
    setIsInputActive(true);
  }, []);

  const setInputInactive = useCallback(() => {
    setIsInputActive(false);

    // Execute any pending callbacks
    const callbacks = pendingCallbacks.current;
    pendingCallbacks.current = [];
    callbacks.forEach((cb) => {
      try {
        cb();
      } catch (error) {
        console.error(
          "[InputActivity] Error executing deferred callback:",
          error,
        );
      }
    });
  }, []);

  const whenInputInactive = useCallback(
    (callback: () => void) => {
      if (!isInputActive) {
        // Input is already inactive, execute immediately
        callback();
      } else {
        // Queue the callback for when input becomes inactive
        pendingCallbacks.current.push(callback);
      }
    },
    [isInputActive],
  );

  return (
    <InputActivityContext.Provider
      value={{
        isInputActive,
        setInputActive,
        setInputInactive,
        whenInputInactive,
      }}
    >
      {children}
    </InputActivityContext.Provider>
  );
}

export function useInputActivity() {
  const context = useContext(InputActivityContext);
  if (!context) {
    throw new Error(
      "useInputActivity must be used within InputActivityProvider",
    );
  }
  return context;
}

/**
 * Hook to defer an operation until input is inactive
 *
 * @param operation - The operation to defer
 * @returns A function that will execute the operation when safe
 */
export function useDeferUntilInputInactive<
  T extends (...args: unknown[]) => unknown,
>(operation: T): T {
  const { whenInputInactive } = useInputActivity();

  return useCallback(
    ((...args: Parameters<T>) => {
      whenInputInactive(() => {
        operation(...args);
      });
    }) as T,
    [operation, whenInputInactive],
  );
}
