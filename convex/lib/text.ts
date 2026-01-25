/**
 * Text processing utilities for normalizing and sanitizing text content.
 *
 * Provides centralized text manipulation functions used across the Convex backend.
 */

/**
 * Normalize whitespace in text: collapse multiple consecutive whitespace characters
 * to a single space and trim leading/trailing whitespace.
 *
 * @param s - Input string (handles null/undefined safely)
 * @returns Normalized string with single spaces and trimmed edges
 *
 * @example
 * normalizeWhitespace("  hello   world  ") // "hello world"
 * normalizeWhitespace(null) // ""
 * normalizeWhitespace(undefined) // ""
 */
export function normalizeWhitespace(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}
