import React from "react";
import { useTheme } from "./ThemeProvider";

export function ThemeToggle() {
  const { setTheme, actualTheme } = useTheme();

  const toggleTheme = React.useCallback(() => {
    // Simple toggle between light and dark
    setTheme(actualTheme === "dark" ? "light" : "dark");
  }, [actualTheme, setTheme]);

  return (
    <button
      onClick={toggleTheme}
      className="group relative flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors duration-200"
      title={`Switch to ${actualTheme === "dark" ? "light" : "dark"} mode`}
      aria-label={`Current theme: ${actualTheme}. Click to switch to ${actualTheme === "dark" ? "light" : "dark"} mode.`}
    >
      {actualTheme === "dark" ? (
        // Abstract crescent moon (lucide/feather style) for dark mode
        <svg
          className="w-5 h-5 text-gray-200"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79Z" />
        </svg>
      ) : (
        // Minimal sun with central disc + rays
        <svg
          className="w-5 h-5 text-gray-700"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5.636 5.636 4.222 4.222M19.778 19.778l-1.414-1.414M5.636 18.364 4.222 19.778M19.778 4.222l-1.414 1.414" />
        </svg>
      )}
    </button>
  );
}
