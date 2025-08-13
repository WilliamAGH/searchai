import React, {
  createContext,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { useQuery, useMutation, useConvexAuth } from "convex/react";
import { api } from "../../convex/_generated/api";

type Theme = "light" | "dark";

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: "light" | "dark";
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize based on system preference or localStorage
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("theme") as Theme;
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
      !localStorage.getItem("theme")
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
      localStorage.setItem("theme", newTheme);

      // Only update user preferences if authenticated
      if (isAuthenticated) {
        try {
          await updatePrefs({ theme: newTheme });
        } catch (error) {
          // Log error if it occurs for authenticated users
          // eslint-disable-next-line @typescript-eslint/no-var-requires
          const { logger } = require("../lib/logger");
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

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
