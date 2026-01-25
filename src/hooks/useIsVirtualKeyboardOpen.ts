/**
 * Hook to detect if virtual keyboard is open on mobile devices.
 * Uses the Visual Viewport API to detect viewport height changes
 * that indicate the keyboard is showing.
 */

import { useState, useEffect } from "react";

/**
 * Minimum viewport height reduction (in pixels) that indicates a virtual
 * keyboard is open. Mobile keyboards are typically 250-350px tall, so 150px
 * provides a conservative threshold that catches most keyboards while avoiding
 * false positives from browser chrome changes.
 */
const KEYBOARD_HEIGHT_THRESHOLD_PX = 150;

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
    if (typeof window === "undefined" || !window.visualViewport) {
      return;
    }

    const viewport = window.visualViewport;

    const checkKeyboard = () => {
      const heightDiff = window.innerHeight - viewport.height;
      setIsOpen(heightDiff > KEYBOARD_HEIGHT_THRESHOLD_PX);
    };

    checkKeyboard();

    viewport.addEventListener("resize", checkKeyboard);
    viewport.addEventListener("scroll", checkKeyboard);

    return () => {
      viewport.removeEventListener("resize", checkKeyboard);
      viewport.removeEventListener("scroll", checkKeyboard);
    };
  }, []);

  return isOpen;
}
