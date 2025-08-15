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
  const t = text.trimEnd();
  return (
    t.includes("...") ||
    t.includes("…") ||
    t.includes("•••") ||
    t.endsWith("..")
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

/**
 * Extract plain text from markdown or formatted content
 * Removes markdown syntax, HTML tags, and other formatting
 *
 * @param content - The content to extract text from
 * @returns Plain text string
 */
export function extractPlainText(content: string): string {
  if (!content) return "";
  
  // Remove markdown links [text](url) -> text
  let text = content.replace(/\[([^\]]+)\]\([^)]+\)/g, "$1");
  
  // Remove markdown bold/italic **text** or *text* -> text
  text = text.replace(/\*\*([^*]+)\*\*/g, "$1");
  text = text.replace(/\*([^*]+)\*/g, "$1");
  
  // Remove markdown headers
  text = text.replace(/^#{1,6}\s+/gm, "");
  
  // Remove HTML tags
  text = text.replace(/<[^>]*>/g, "");
  
  // Remove code blocks
  text = text.replace(/```[^`]*```/g, "");
  text = text.replace(/`([^`]+)`/g, "$1");
  
  // Clean up extra whitespace
  text = text.replace(/\s+/g, " ").trim();
  
  return text;
}
