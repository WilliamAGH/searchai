/**
 * iOS Safari Detection and Utilities
 *
 * CRITICAL: iOS Safari has known issues with keyboard focus that can cause crashes.
 * This utility provides centralized detection and safeguards.
 *
 * @module ios
 * @description Comprehensive iOS Safari detection and keyboard crash prevention utilities
 *
 * @see https://bugs.webkit.org/show_bug.cgi?id=195884 - WebKit bug report for keyboard issues
 * @see https://github.com/facebook/react/issues/19961 - React issue discussing iOS Safari focus problems
 * @see https://stackoverflow.com/questions/57803/how-to-make-mobile-safari-not-freeze-when-input-is-focused
 *
 * @example
 * ```typescript
 * import { isIOSSafari, safeFocus } from '@/lib/utils/ios';
 *
 * // Check if running on iOS Safari
 * if (isIOSSafari()) {
 *   console.log('Running on iOS Safari - applying keyboard crash prevention');
 * }
 *
 * // Safely focus an input element
 * const inputElement = document.getElementById('my-input');
 * safeFocus(inputElement, { preventScroll: true });
 * ```
 */

/**
 * Detects if the current browser is iOS Safari (not Chrome/Firefox on iOS)
 *
 * @description This function specifically detects iOS Safari, excluding other browsers
 * running on iOS like Chrome or Firefox. This is critical for preventing keyboard
 * crashes that are specific to Safari's WebKit implementation on iOS devices.
 *
 * @returns {boolean} True if the browser is iOS Safari, false otherwise
 *
 * @remarks
 * - Returns false during SSR (when window/navigator are undefined)
 * - Distinguishes between Safari and Chrome/Firefox/Opera on iOS
 * - Chrome on iOS uses "CriOS" in user agent
 * - Firefox on iOS uses "FxiOS" in user agent
 * - Opera on iOS uses "OPiOS" in user agent
 *
 * @example
 * ```typescript
 * if (isIOSSafari()) {
 *   // Skip auto-focus to prevent keyboard crash
 *   console.warn('iOS Safari detected - skipping auto-focus');
 * } else {
 *   inputElement.focus();
 * }
 * ```
 */
export function isIOSSafari(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  // Check for iOS devices
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent);
  if (!isIOS) return false;

  // Check for Safari WebKit (not Chrome, Firefox, or Opera on iOS)
  const isWebKit = /WebKit/.test(navigator.userAgent);
  const isNotOtherBrowser = !/CriOS|FxiOS|OPiOS|mercury/.test(
    navigator.userAgent,
  );

  return isWebKit && isNotOtherBrowser;
}

/**
 * Detects if the device is any iOS device (including Chrome/Firefox on iOS)
 *
 * @description This function detects ANY iOS device, regardless of browser.
 * Use this when you need to detect iOS platform features rather than
 * browser-specific issues.
 *
 * @returns {boolean} True if the device is running iOS, false otherwise
 *
 * @remarks
 * - Detects iPhone, iPad, and iPod devices
 * - Also detects iPad Pro which reports as "MacIntel" with touch support
 * - Returns false during SSR (when window/navigator are undefined)
 * - Includes ALL browsers on iOS (Safari, Chrome, Firefox, Opera, etc.)
 *
 * @example
 * ```typescript
 * if (isIOS()) {
 *   // Apply iOS-specific UI adjustments
 *   document.body.classList.add('ios-device');
 * }
 * ```
 */
export function isIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }

  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  ); // iPad Pro detection
}

/**
 * Safely focuses an element with iOS Safari protection
 *
 * @description This function provides a safe wrapper around the native focus() method
 * that prevents keyboard crashes on iOS Safari. It includes multiple safety checks
 * and configuration options for different focus scenarios.
 *
 * @param {HTMLElement | null | undefined} element - The element to focus
 * @param {Object} [options] - Focus options
 * @param {boolean} [options.preventScroll=false] - Prevent scrolling when focusing
 * @param {boolean} [options.skipIOSSafari=false] - Force focus even on iOS Safari (use with caution)
 * @param {boolean} [options.useRAF=false] - Use requestAnimationFrame for smoother focus transition
 *
 * @returns {boolean} True if focus was attempted, false if skipped or failed
 *
 * @remarks
 * - Automatically skips focus on iOS Safari unless explicitly overridden
 * - Logs warnings when focus is skipped for debugging
 * - Catches and logs any focus errors
 * - Can use requestAnimationFrame for smoother mobile transitions
 *
 * @example
 * ```typescript
 * // Basic usage - will skip on iOS Safari
 * const input = document.getElementById('email-input');
 * safeFocus(input);
 *
 * // Prevent scroll when focusing
 * safeFocus(input, { preventScroll: true });
 *
 * // Use RAF for smoother transition
 * safeFocus(input, { useRAF: true, preventScroll: true });
 *
 * // Force focus even on iOS Safari (dangerous!)
 * safeFocus(input, { skipIOSSafari: true });
 * ```
 */
export function safeFocus(
  element: HTMLElement | null | undefined,
  options?: {
    preventScroll?: boolean;
    skipIOSSafari?: boolean;
    useRAF?: boolean;
  },
): boolean {
  if (!element) return false;

  // Skip focus on iOS Safari unless explicitly allowed
  if (!options?.skipIOSSafari && isIOSSafari()) {
    if (import.meta.env.DEV) {
      console.warn(
        "[iOS Safari] Focus operation skipped to prevent keyboard crash",
      );
    }
    return false;
  }

  const doFocus = () => {
    try {
      element.focus({ preventScroll: options?.preventScroll });
      return true;
    } catch (e) {
      if (import.meta.env.DEV) {
        console.error("[Focus] Error focusing element:", e);
      }
      return false;
    }
  };

  // Use requestAnimationFrame for smoother focus on mobile
  if (options?.useRAF) {
    requestAnimationFrame(doFocus);
    return true;
  }

  return doFocus();
}

/**
 * Safely selects text in an element with iOS Safari protection
 *
 * @description Provides a safe wrapper around the native select() method
 * that prevents keyboard crashes on iOS Safari. The select() method can
 * trigger keyboard issues on iOS when called programmatically.
 *
 * @param {HTMLInputElement | HTMLTextAreaElement | null | undefined} element - The input or textarea element to select
 *
 * @returns {boolean} True if selection was successful, false if skipped or failed
 *
 * @remarks
 * - Automatically skips selection on iOS Safari
 * - Logs warnings when selection is skipped
 * - Catches and logs any selection errors
 * - Only works with input and textarea elements
 *
 * @example
 * ```typescript
 * const input = document.getElementById('copy-input') as HTMLInputElement;
 * if (safeSelect(input)) {
 *   // Selection successful, can now copy
 *   document.execCommand('copy');
 * } else {
 *   // Selection was skipped or failed
 *   console.warn('Could not select text');
 * }
 * ```
 */
export function safeSelect(
  element: HTMLInputElement | HTMLTextAreaElement | null | undefined,
): boolean {
  if (!element) return false;

  // Skip select on iOS Safari to prevent keyboard issues
  if (isIOSSafari()) {
    if (import.meta.env.DEV) {
      console.warn(
        "[iOS Safari] Select operation skipped to prevent keyboard crash",
      );
    }
    return false;
  }

  try {
    element.select();
    return true;
  } catch (e) {
    if (import.meta.env.DEV) {
      console.error("[Select] Error selecting element:", e);
    }
    return false;
  }
}

/**
 * Returns a safe autofocus prop value for iOS Safari
 *
 * @description Helper function to determine if autofocus should be enabled
 * based on the browser. Prevents the autofocus attribute from causing
 * keyboard crashes on iOS Safari.
 *
 * @param {boolean} [defaultValue=true] - The default autofocus value for non-iOS Safari browsers
 *
 * @returns {boolean} False on iOS Safari, otherwise returns the defaultValue
 *
 * @remarks
 * - Use this for the autoFocus prop on input elements
 * - Always returns false on iOS Safari
 * - Allows customization of default behavior for other browsers
 *
 * @example
 * ```typescript
 * // In a React component
 * <input
 *   type="email"
 *   autoFocus={getSafeAutoFocus()}
 *   placeholder="Enter your email"
 * />
 *
 * // With custom default (normally no autofocus, but enable on desktop)
 * <textarea
 *   autoFocus={getSafeAutoFocus(false)}
 *   placeholder="Enter your message"
 * />
 * ```
 */
export function getSafeAutoFocus(defaultValue: boolean = true): boolean {
  return isIOSSafari() ? false : defaultValue;
}
