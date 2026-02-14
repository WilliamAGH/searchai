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
import { logger } from "@/lib/logger";

/**
 * Storage keys for theme persistence
 */
const THEME_STORAGE_KEY = "researchly_theme";

/**
 * Minimal storage service for theme persistence
 * Provides safe localStorage access with error handling
 */
const storageService = {
  getTheme(): Theme | null {
    try {
      const raw = localStorage.getItem(THEME_STORAGE_KEY);
      if (!raw) return null;
      const parsed: unknown = JSON.parse(raw);
      return parsed === "light" || parsed === "dark" ? parsed : null;
    } catch (error) {
      logger.error("Failed to read theme from localStorage", {
        key: THEME_STORAGE_KEY,
        error,
      });
      return null;
    }
  },
  setTheme(value: Theme): void {
    try {
      localStorage.setItem(THEME_STORAGE_KEY, JSON.stringify(value));
    } catch (error) {
      logger.error("Failed to persist theme to localStorage", {
        key: THEME_STORAGE_KEY,
        error,
      });
    }
  },
  hasTheme(): boolean {
    try {
      return localStorage.getItem(THEME_STORAGE_KEY) !== null;
    } catch (error) {
      logger.error("Failed to check localStorage key", {
        key: THEME_STORAGE_KEY,
        error,
      });
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
export function ThemeProvider({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  const [theme, setTheme] = useState<Theme>(() => {
    // Initialize based on system preference or localStorage
    if (globalThis.window !== undefined) {
      const stored = storageService.getTheme();
      if (stored === "light" || stored === "dark") {
        return stored;
      }
      // Default to system preference
      return globalThis.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light";
    }
    return "light";
  });

  const { isAuthenticated } = useConvexAuth();
  // @ts-expect-error — TS2589: Convex generic type instantiation is excessively
  // deep for useQuery<typeof api.preferences.getUserPreferences>. Known Convex
  // limitation; the query accepts no args and returns { theme?: string } | null.
  const userPrefs = useQuery(api.preferences.getUserPreferences);
  const updatePrefs = useMutation(api.preferences.updateUserPreferences);

  // Initialize theme from user preferences, but don't override localStorage
  useEffect(() => {
    if (
      userPrefs?.theme &&
      userPrefs.theme !== "system" &&
      !storageService.hasTheme()
    ) {
      setTheme(userPrefs.theme);
    }
  }, [userPrefs]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.remove("light", "dark");
    document.documentElement.classList.add(theme);
  }, [theme]);

  const updateTheme = React.useCallback(
    async (newTheme: Theme) => {
      // Update state immediately for instant UI response
      setTheme(newTheme);
      storageService.setTheme(newTheme);

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
    [isAuthenticated, updatePrefs, setTheme],
  );

  const contextValue = useMemo(
    () => ({ theme, setTheme: updateTheme, actualTheme: theme }),
    [theme, updateTheme],
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
