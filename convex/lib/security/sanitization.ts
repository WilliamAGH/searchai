/**
 * Comprehensive sanitization module for preventing injection attacks
 * This module provides robust sanitization for all user inputs to prevent:
 * - Prompt injection attacks
 * - Unicode-based attacks
 * - Base64 encoded injections
 * - HTML/Script injections
 * - Template injections
 */

import { isRecord } from "../validators";

/**
 * Main sanitization function that applies all security measures
 * @param input - Raw user input to sanitize
 * @returns Sanitized string safe for processing
 */
export function robustSanitize(input: string): string {
  if (!input || typeof input !== "string") {
    return "";
  }

  let clean = input;

  // 1. Unicode normalization (NFKC)
  // This converts lookalike characters to their standard forms
  clean = clean.normalize("NFKC");

  // 2. Remove ALL zero-width characters
  // These invisible characters can be used to bypass filters
  clean = clean.replaceAll(/[\u200B-\u200D\uFEFF]/g, "");

  // 3. Convert fullwidth/special Unicode to ASCII
  // Fullwidth characters can be used to disguise malicious input
  clean = clean.replaceAll(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCodePoint((ch.codePointAt(0) ?? 0) - 0xfee0),
  );

  // 4. Detect and neutralize base64 encoded injections
  const base64Pattern =
    /(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
  const STRICT_BASE64 = /^[A-Za-z0-9+/]*={0,2}$/;
  clean = clean.replaceAll(base64Pattern, (match) => {
    // Skip short matches and strings that aren't structurally valid base64
    if (match.length < 20) return match;
    if (match.length % 4 !== 0 || !STRICT_BASE64.test(match)) return match;

    // Pre-validation (length, %4, strict regex) filters structurally invalid
    // base64. If atob still rejects, the input is not real base64 and therefore
    // cannot hide decoded injection keywords — safe to pass through. Throwing
    // inside a replaceAll callback would abort the entire sanitization pass,
    // leaving `clean` in a partially-sanitized state (worse security outcome).
    let decoded: string;
    try {
      decoded = atob(match);
    } catch (error) {
      console.error(
        `[sanitization] atob() rejected structurally-valid input (length=${match.length})`,
        error,
      );
      return match;
    }

    // Check for common injection keywords in decoded content
    if (/system|ignore|instruction|assistant|forget|disregard/i.test(decoded)) {
      return "[BASE64_BLOCKED]";
    }
    return match;
  });

  // 5. Remove prompt injection patterns
  const injectionPatterns = [
    // System command attempts
    /sys[\s\-_]*tem[\s\-_]*[:：]/gi,
    /assistant[\s\-_]*[:：]/gi,
    /human[\s\-_]*[:：]/gi,
    /user[\s\-_]*[:：]/gi,

    // Instruction override attempts
    /ignore[\s\-_]*previous/gi,
    /ignore[\s\-_]*above/gi,
    /disregard[\s\-_]*previous/gi,
    /disregard[\s\-_]*above/gi,
    /forget[\s\-_]*everything/gi,
    /forget[\s\-_]*previous/gi,

    // Role escalation attempts
    /you[\s\-_]*are[\s\-_]*now/gi,
    /act[\s\-_]*as[\s\-_]*a/gi,
    /pretend[\s\-_]*to[\s\-_]*be/gi,
    /switch[\s\-_]*to/gi,
    /become[\s\-_]*a/gi,

    // Delimiter injection attempts
    /\[INST\]/gi,
    /\[\/INST\]/gi,
    /<<<\s*\/\s*SYS\s*>>>/gi,
    /###\s*Human/gi,
    /###\s*Assistant/gi,
  ];

  for (const pattern of injectionPatterns) {
    clean = clean.replaceAll(pattern, "[INJECTION_BLOCKED]");
  }

  // 6. Remove HTML/Script tags
  clean = clean.replaceAll(
    /<script\b[^>]*>[\s\S]*?(?:<\/script\s*>|$)/gi,
    "[SCRIPT_BLOCKED]",
  );
  clean = clean.replaceAll(
    /<iframe\b[^>]*>[\s\S]*?(?:<\/iframe\s*>|$)/gi,
    "[IFRAME_BLOCKED]",
  );
  clean = clean.replaceAll(
    /<object\b[^>]*>[\s\S]*?(?:<\/object\s*>|$)/gi,
    "[OBJECT_BLOCKED]",
  );
  clean = clean.replaceAll(/<embed[^>]*>/gi, "[EMBED_BLOCKED]");

  // 7. Remove javascript: and data: URLs
  clean = clean.replaceAll(/javascript:/gi, "[JS_BLOCKED]");
  clean = clean.replaceAll(/data:text\/html/gi, "[DATA_BLOCKED]");

  // 8. Enforce maximum length (2000 characters)
  // Extremely long inputs can be used for buffer overflow or DoS
  if (clean.length > 2000) {
    clean = clean.slice(0, 2000);
  }

  return clean.trim();
}

/**
 * Sanitize input specifically for use in search queries
 * Applies additional restrictions suitable for search
 */
export function sanitizeForSearch(input: string): string {
  let clean = robustSanitize(input);

  // Remove special search operators that could manipulate queries
  clean = clean.replaceAll(/[+\-*"'()]/g, " ");

  // Collapse multiple spaces
  clean = clean.replaceAll(/\s+/g, " ");

  // Limit to 200 chars for search queries
  if (clean.length > 200) {
    clean = clean.slice(0, 200);
  }

  return clean.trim();
}

/**
 * Sanitize an array of strings (e.g., batch processing)
 */
export function sanitizeArray(inputs: string[]): string[] {
  return inputs.map((input) => robustSanitize(input));
}

/**
 * Check if input contains potential injection attempts
 * Returns true if suspicious patterns detected (for logging/monitoring)
 */
export function detectInjectionAttempt(input: string): boolean {
  if (!input || typeof input !== "string") {
    return false;
  }

  const suspiciousPatterns = [
    /system[\s\-_]*:/i,
    /ignore[\s\-_]*previous/i,
    /you[\s\-_]*are[\s\-_]*now/i,
    /<script/i,
    /javascript:/i,
    /\[INST\]/i,
    /<<<\s*SYS\s*>>>/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize content that may contain HTML (e.g., scraped web content)
 */
export function sanitizeHtmlContent(html: string): string {
  let clean = html;

  // Remove all script tags and content
  clean = clean.replaceAll(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );

  // Remove all style tags and content
  clean = clean.replaceAll(
    /<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi,
    "",
  );

  // Remove all HTML comments
  clean = clean.replaceAll(/<!--[\s\S]*?-->/g, "");

  // Remove meta refresh tags
  clean = clean.replaceAll(/<meta[^>]*http-equiv[^>]*>/gi, "");

  // Remove all event handlers
  clean = clean.replaceAll(/\s*on\w+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "");

  // Apply standard sanitization
  clean = robustSanitize(clean);

  return clean;
}

/**
 * Validate and sanitize JSON strings
 */
export function sanitizeJson(jsonString: string): string | null {
  try {
    const parsed = JSON.parse(jsonString);

    // Recursively sanitize all string values in the JSON
    const sanitizeObject = (obj: unknown): unknown => {
      if (typeof obj === "string") {
        return robustSanitize(obj);
      } else if (Array.isArray(obj)) {
        return obj.map(sanitizeObject);
      } else if (isRecord(obj)) {
        const result: Record<string, unknown> = {};
        for (const key of Object.keys(obj)) {
          // Sanitize the key as well
          const sanitizedKey = robustSanitize(key);
          result[sanitizedKey] = sanitizeObject(obj[key]);
        }
        return result;
      }
      return obj;
    };

    const sanitized = sanitizeObject(parsed);
    return JSON.stringify(sanitized);
  } catch (error) {
    console.warn("Failed to sanitize JSON input", { error });
    // Invalid JSON, return null
    return null;
  }
}
