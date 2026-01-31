import { robustSanitize } from "./sanitization";
import { normalizeWhitespace } from "../text";

/**
 * Extract and sanitize text content from HTML
 * Removes all HTML tags and returns plain text
 */
export function extractTextFromHtml(html: string): string {
  let text = html;

  // Remove script and style content completely
  text = text.replace(/<script[\s\S]*?<\/script>/gi, "");
  text = text.replace(/<style[\s\S]*?<\/style>/gi, "");

  // Remove all HTML tags
  text = text.replace(/<[^>]+>/g, " ");

  // Decode HTML entities
  text = text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&#x27;/g, "'")
    .replace(/&#x2F;/g, "/")
    .replace(/&#(\d+);/g, (match, dec) => String.fromCharCode(dec));

  // Collapse whitespace
  text = normalizeWhitespace(text);

  // Apply sanitization
  return robustSanitize(text);
}
