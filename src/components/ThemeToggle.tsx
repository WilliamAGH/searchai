import { useTheme } from './ThemeProvider';

export function ThemeToggle() {
  const { theme, setTheme, actualTheme } = useTheme();

  const toggleTheme = () => {
    // Simple toggle between light and dark
    setTheme(actualTheme === 'dark' ? 'light' : 'dark');
  };

  return (
    <button
      onClick={toggleTheme}
      className="flex items-center justify-center w-9 h-9 rounded-lg bg-gray-100 dark:bg-gray-800 hover:bg-gray-200 dark:hover:bg-gray-700 transition-all duration-200 transform hover:scale-105"
      title={`Switch to ${actualTheme === 'dark' ? 'light' : 'dark'} mode`}
      aria-label={`Current theme: ${actualTheme}. Click to switch to ${actualTheme === 'dark' ? 'light' : 'dark'} mode.`}
    >
      <span className="text-lg select-none flex items-center justify-center w-5 h-5">
        {actualTheme === 'dark' ? '🌙' : '☀️'}
      </span>
    </button>
  );
}
