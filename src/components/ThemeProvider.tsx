/**
 * Theme Provider Component
 * Manages application theme (light/dark mode) with persistence
 * Syncs theme preferences between localStorage and user preferences
 * Provides theme context to entire application
 */

import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";
import { logger } from "../lib/logger";

/**
 * Storage keys for theme persistence
 */
const STORAGE_KEYS = {
  THEME: "searchai_theme",
} as const;

/**
 * Minimal storage service for theme persistence
 * Provides safe localStorage access with error handling
 */
const storageService = {
  /**
   * Get parsed value from localStorage
   * @template T - Expected type of stored value
   * @param {string} key - Storage key
   * @returns {T | null} Parsed value or null if not found/invalid
   */
  get<T>(key: string): T | null {
    try {
      const raw = localStorage.getItem(key);
      return raw ? (JSON.parse(raw) as T) : null;
    } catch {
      return null;
    }
  },
  /**
   * Store value in localStorage
   * @template T - Type of value to store
   * @param {string} key - Storage key
   * @param {T} value - Value to store
   */
  set<T>(key: string, value: T): void {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // ignore storage errors
    }
  },
  /**
   * Check if key exists in localStorage
   * @param {string} key - Storage key
   * @returns {boolean} True if key exists
   */
  has(key: string): boolean {
    try {
      return localStorage.getItem(key) !== null;
    } catch {
      return false;
    }
  },
};

/** Available theme options */
type Theme = "light" | "dark";

/**
 * Theme context interface
 * @interface ThemeContextType
 */
interface ThemeContextType {
  /** Current theme setting */
  theme: Theme;
  /** Function to update theme */
  setTheme: (theme: Theme) => void;
  /** Resolved theme (same as theme, for compatibility) */
  actualTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

/**
 * ThemeProvider component
 *
 * Features:
 * - Initializes theme from localStorage or system preference
 * - Syncs with user preferences for authenticated users
 * - Applies theme class to document root
 * - Provides theme context to children
 *
 * @param {Object} props - Component props
 * @param {React.ReactNode} props.children - Child components
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize based on system preference or localStorage
    if (typeof window !== "undefined") {
      const stored = storageService.get<Theme>(STORAGE_KEYS.THEME);
      if (stored === "light" || stored === "dark") {
        return stored;
      }
      // Default to system preference
      return window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  });

  const { isAuthenticated } = useConvexAuth();
  const userPrefs = useQuery(api.preferences.getUserPreferences);
  const updatePrefs = useMutation(api.preferences.updateUserPreferences);

  // Initialize theme from user preferences, but don't override localStorage
  useEffect(() => {
    if (
      userPrefs?.theme &&
      userPrefs.theme !== "system" &&
      !storageService.has(STORAGE_KEYS.THEME)
    ) {
      setThemeState(userPrefs.theme);
    }
  }, [userPrefs]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  const setTheme = React.useCallback(
    async (newTheme: Theme) => {
      // Update state immediately for instant UI response
      setThemeState(newTheme);
      storageService.set(STORAGE_KEYS.THEME, newTheme);

      // Only update user preferences if authenticated
      if (isAuthenticated) {
        try {
          await updatePrefs({ theme: newTheme });
        } catch (error) {
          // Log error if it occurs for authenticated users
          logger.error("Failed to save theme preference:", error);
        }
      }
    },
    [isAuthenticated, updatePrefs],
  );

  const contextValue = useMemo(
    () => ({ theme, setTheme, actualTheme: theme as Theme }),
    [theme, setTheme],
  );

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

/**
 * Hook to access theme context
 * Must be used within a ThemeProvider
 *
 * @returns {ThemeContextType} Theme context with current theme and setter
 * @throws {Error} If used outside of ThemeProvider
 */
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
