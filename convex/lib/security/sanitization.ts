/**
 * Comprehensive sanitization module for preventing injection attacks
 * This module provides robust sanitization for all user inputs to prevent:
 * - Prompt injection attacks
 * - Unicode-based attacks
 * - Base64 encoded injections
 * - HTML/Script injections
 * - Template injections
 */

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
  clean = clean.replace(/[\u200B-\u200D\uFEFF]/g, "");

  // 3. Convert fullwidth/special Unicode to ASCII
  // Fullwidth characters can be used to disguise malicious input
  clean = clean.replace(/[\uFF01-\uFF5E]/g, (ch) =>
    String.fromCharCode(ch.charCodeAt(0) - 0xfee0),
  );

  // 4. Detect and neutralize base64 encoded injections
  const base64Pattern =
    /(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?/g;
  clean = clean.replace(base64Pattern, (match) => {
    // Skip short matches that are likely not base64
    if (match.length < 20) return match;

    try {
      // Use atob() for base64 decoding (Convex runtime compatible)
      // atob() is available in the Convex V8 runtime
      const decoded = atob(match);

      // Check for common injection keywords in decoded content
      if (
        /system|ignore|instruction|assistant|forget|disregard/i.test(decoded)
      ) {
        return "[BASE64_BLOCKED]";
      }
    } catch (error) {
      console.warn("Failed to decode base64 input during sanitization", {
        error,
      });
      // If decoding fails, it's not valid base64, keep original
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
    /<<<[\s]*\/[\s]*SYS[\s]*>>>/gi,
    /###[\s]*Human/gi,
    /###[\s]*Assistant/gi,
  ];

  for (const pattern of injectionPatterns) {
    clean = clean.replace(pattern, "[INJECTION_BLOCKED]");
  }

  // 6. Remove HTML/Script tags
  clean = clean.replace(/<script[^>]*>.*?<\/script>/gi, "[SCRIPT_BLOCKED]");
  clean = clean.replace(/<iframe[^>]*>.*?<\/iframe>/gi, "[IFRAME_BLOCKED]");
  clean = clean.replace(/<object[^>]*>.*?<\/object>/gi, "[OBJECT_BLOCKED]");
  clean = clean.replace(/<embed[^>]*>/gi, "[EMBED_BLOCKED]");

  // 7. Remove javascript: and data: URLs
  clean = clean.replace(/javascript:/gi, "[JS_BLOCKED]");
  clean = clean.replace(/data:text\/html/gi, "[DATA_BLOCKED]");

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
  clean = clean.replace(/[+\-*"'()]/g, " ");

  // Collapse multiple spaces
  clean = clean.replace(/\s+/g, " ");

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
    /<<<[\s]*SYS[\s]*>>>/i,
  ];

  return suspiciousPatterns.some((pattern) => pattern.test(input));
}

/**
 * Sanitize content that may contain HTML (e.g., scraped web content)
 */
export function sanitizeHtmlContent(html: string): string {
  let clean = html;

  // Remove all script tags and content
  clean = clean.replace(
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    "",
  );

  // Remove all style tags and content
  clean = clean.replace(/<style\b[^<]*(?:(?!<\/style>)<[^<]*)*<\/style>/gi, "");

  // Remove all HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, "");

  // Remove meta refresh tags
  clean = clean.replace(/<meta[^>]*http-equiv[^>]*>/gi, "");

  // Remove all event handlers
  clean = clean.replace(/\s*on\w+\s*=\s*["'][^"']*["']/gi, "");

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
      } else if (obj !== null && typeof obj === "object") {
        const result: Record<string, unknown> = {};
        for (const key in obj as Record<string, unknown>) {
          if (Object.prototype.hasOwnProperty.call(obj, key)) {
            // Sanitize the key as well
            const sanitizedKey = robustSanitize(key);
            result[sanitizedKey] = sanitizeObject(
              (obj as Record<string, unknown>)[key],
            );
          }
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

/**
 * Normalize a search result from external input
 * Ensures all required fields are present with valid values
 * Particularly important for HTTP endpoints that receive searchResults
 *
 * @param result - Raw search result from external source
 * @returns Normalized SearchResult with guaranteed fields
 */
export function normalizeSearchResult(result: unknown): {
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
} {
  // Ensure we have an object
  if (!result || typeof result !== "object") {
    return {
      title: "Untitled",
      url: "",
      snippet: "",
      relevanceScore: 0.5,
    };
  }

  // Type narrow to access properties safely
  const r = result as Record<string, unknown>;

  // Normalize relevanceScore - must be a number between 0 and 1
  let relevanceScore = 0.5; // Default
  if (typeof r.relevanceScore === "number") {
    // Clamp to valid range [0, 1]
    relevanceScore = Math.max(0, Math.min(1, r.relevanceScore));
  } else if (r.relevanceScore !== undefined) {
    // Try to parse if it's a string number
    const parsed = parseFloat(String(r.relevanceScore));
    if (!isNaN(parsed)) {
      relevanceScore = Math.max(0, Math.min(1, parsed));
    }
  }

  return {
    title: robustSanitize(String(r.title || "Untitled")),
    url: String(r.url || ""), // Don't sanitize URLs - might break them
    snippet: robustSanitize(String(r.snippet || "")),
    relevanceScore,
  };
}

/**
 * Normalize an array of search results
 *
 * @param results - Raw array of search results
 * @returns Array of normalized SearchResult objects
 */
export function normalizeSearchResults(results: unknown): Array<{
  title: string;
  url: string;
  snippet: string;
  relevanceScore: number;
}> {
  if (!Array.isArray(results)) {
    return [];
  }

  return results.map(normalizeSearchResult);
}
