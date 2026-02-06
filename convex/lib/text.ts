/**
 * Text processing utilities for normalizing and sanitizing text content.
 *
 * Provides centralized text manipulation functions used across both the
 * Convex backend and the frontend (src/lib/clipboard.ts imports from here).
 */

// --- Markdown-stripping patterns ---

/** Fenced code blocks: keeps inner content, strips ``` markers and optional language tag */
const FENCED_CODE_BLOCK = /```(?:\w*\n)?([\s\S]*?)```/g;
/** Markdown links [text](url) → captures text only */
const MARKDOWN_LINK = /\[([^\]]+)\]\([^)]+\)/g;
/** Bold/italic markers **text** or *text* or __text__ or _text_ */
const BOLD_ITALIC_MARKERS = /[*_]{1,2}([^*_]+)[*_]{1,2}/g;
/** Inline code `text` → captures text only */
const INLINE_CODE = /`([^`]+)`/g;
/** HTML tags (opening, closing, self-closing) */
const HTML_TAGS = /<[^>]*>/g;

// --- Whitespace normalization patterns ---

/** One or more spaces/tabs (horizontal whitespace) without matching newlines */
const HORIZONTAL_WHITESPACE_RUN = /[^\S\n]+/g;
/** 3+ consecutive newlines to collapse excessive blank lines */
const EXCESSIVE_BLANK_LINES = /\n{3,}/g;

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
 */
export function normalizeWhitespace(s: string | undefined | null): string {
  return (s ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Normalize horizontal whitespace only (spaces/tabs), preserving line breaks.
 * Collapses runs of spaces/tabs to a single space per line, limits consecutive
 * blank lines to at most one, and trims leading/trailing whitespace.
 *
 * @param s - Input string (handles null/undefined safely)
 * @returns String with horizontal whitespace normalized but newlines preserved
 *
 * @example
 * normalizeHorizontalWhitespace("hello   world") // "hello world"
 * normalizeHorizontalWhitespace("line1\n\nline2") // "line1\n\nline2"
 * normalizeHorizontalWhitespace("a\n\n\n\nb") // "a\n\nb"
 */
export function normalizeHorizontalWhitespace(
  s: string | undefined | null,
): string {
  let text = (s ?? "").replace(HORIZONTAL_WHITESPACE_RUN, " ");
  text = text.replace(EXCESSIVE_BLANK_LINES, "\n\n");
  return text.trim();
}

/**
 * Strip markdown syntax from content, preserving line breaks.
 * Removes links, bold/italic, code fences, inline code, and HTML tags,
 * then normalizes horizontal whitespace.
 *
 * Canonical implementation — imported by both convex/http/utils.ts and
 * src/lib/clipboard.ts to avoid duplication.
 *
 * @param content - Markdown/HTML content string
 * @returns Plain text with structural line breaks preserved
 */
export function extractPlainText(content: string): string {
  let text = (content || "").replace(FENCED_CODE_BLOCK, "$1");
  text = text.replace(MARKDOWN_LINK, "$1");
  text = text.replace(BOLD_ITALIC_MARKERS, "$1");
  text = text.replace(INLINE_CODE, "$1");
  text = text.replace(HTML_TAGS, "");
  text = text.replace(HORIZONTAL_WHITESPACE_RUN, " ");
  text = text.replace(EXCESSIVE_BLANK_LINES, "\n\n");
  return text.trim();
}
