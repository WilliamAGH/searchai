/**
 * Text utility functions
 */

/**
 * Check if text already contains dots (static or ellipsis)
 * This prevents duplicate dots when showing loading animations
 *
 * @param text - The text to check
 * @returns true if text contains any form of dots
 */
export function containsDots(text: string | undefined | null): boolean {
  if (!text) return false;

  // Check for various forms of dots:
  // - Three periods: ...
  // - Ellipsis character: …
  // - Three bullets: •••
  // - Ends with dots (for "Loading..." etc)
  return (
    text.includes("...") ||
    text.includes("…") ||
    text.includes("•••") ||
    text.endsWith("..") ||
    text.endsWith("..")
  );
}

/**
 * Check if we should show animated dots
 * Only show if the text doesn't already contain static dots
 *
 * @param text - The text to check
 * @param isAnimating - Whether animation is active (streaming, loading, etc)
 * @returns true if animated dots should be shown
 */
export function shouldShowAnimatedDots(
  text: string | undefined | null,
  isAnimating: boolean,
): boolean {
  return isAnimating && !containsDots(text);
}
