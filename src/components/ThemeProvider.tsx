import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useMutation } from 'convex/react';
import { api } from '../../convex/_generated/api';

type Theme = 'light' | 'dark';

interface ThemeContextType {
  theme: Theme;
  setTheme: (theme: Theme) => void;
  actualTheme: 'light' | 'dark';
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(() => {
    // Initialize based on system preference or localStorage
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem('theme') as Theme;
      if (stored === 'light' || stored === 'dark') {
        return stored;
      }
      // Default to system preference
      return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
    }
    return 'light';
  });
  
  const userPrefs = useQuery(api.preferences.getUserPreferences);
  const updatePrefs = useMutation(api.preferences.updateUserPreferences);

  // Initialize theme from user preferences, but don't override localStorage
  useEffect(() => {
    if (userPrefs?.theme && userPrefs.theme !== 'system' && !localStorage.getItem('theme')) {
      setThemeState(userPrefs.theme);
    }
  }, [userPrefs]);

  // Apply theme to document
  useEffect(() => {
    document.documentElement.classList.remove('light', 'dark');
    document.documentElement.classList.add(theme);
  }, [theme]);

  const setTheme = async (newTheme: Theme) => {
    // Update state immediately for instant UI response
    setThemeState(newTheme);
    localStorage.setItem('theme', newTheme);
    
    // Try to update user preferences, but don't block on it
    try {
      await updatePrefs({ theme: newTheme });
    } catch (error) {
      // Ignore errors for unauthenticated users
      console.debug('Could not save theme preference:', error);
    }
  };

  return (
    <ThemeContext.Provider value={{ theme, setTheme, actualTheme: theme }}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}
