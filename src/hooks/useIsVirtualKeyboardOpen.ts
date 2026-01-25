/**
 * Hook to detect if virtual keyboard is open on mobile devices.
 * Uses the Visual Viewport API to detect viewport height changes
 * that indicate the keyboard is showing.
 */

import { useState, useEffect } from "react";

/**
 * Detect if virtual keyboard is likely open based on viewport shrinkage.
 * This helps prevent auto-scroll and other viewport manipulations
 * while the user is interacting with an input on mobile.
 *
 * @returns True if virtual keyboard appears to be open
 */
export function useIsVirtualKeyboardOpen(): boolean {
  const [isOpen, setIsOpen] = useState(false);

  useEffect(() => {
    // SSR guard and feature detection
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const checkKeyboard = () => {
      // Keyboard is likely open if visual viewport height is significantly
      // less than the window inner height. 150px threshold accounts for
      // typical mobile keyboard heights (usually 250-350px).
      const heightDiff = window.innerHeight - viewport.height;
      setIsOpen(heightDiff > 150);
    };

    // Check immediately
    checkKeyboard();

    // Listen for viewport changes (keyboard show/hide)
    viewport.addEventListener("resize", checkKeyboard);
    viewport.addEventListener("scroll", checkKeyboard);

    return () => {
      viewport.removeEventListener("resize", checkKeyboard);
      viewport.removeEventListener("scroll", checkKeyboard);
    };
  }, []);

  return isOpen;
}
