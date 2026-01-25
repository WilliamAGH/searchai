/**
 * Web content validation module
 * Validates and sanitizes scraped web content to prevent injection attacks
 * and ensure safe processing of external content
 */

import { robustSanitize } from "./sanitization";
import { checkForInjection, assessRisk } from "./patterns";
import { normalizeWhitespace } from "../text";

/**
 * Result of web content validation
 */
export interface ValidationResult {
  safe: string;
  removed: string[];
  risk: "low" | "medium" | "high" | "critical";
  injectionDetected: boolean;
  injectionTypes: string[];
  metadata: {
    originalLength: number;
    cleanedLength: number;
    removedPercentage: number;
  };
}

/**
 * Dangerous HTML patterns to remove
 */
const DANGEROUS_PATTERNS = [
  { pattern: /<!--[\s\S]*?-->/g, name: "HTML comments" },
  { pattern: /<script[\s\S]*?<\/script>/gi, name: "Script tags" },
  { pattern: /<style[\s\S]*?<\/style>/gi, name: "Style tags" },
  { pattern: /<iframe[\s\S]*?<\/iframe>/gi, name: "Iframe tags" },
  { pattern: /<object[\s\S]*?<\/object>/gi, name: "Object tags" },
  { pattern: /<embed[^>]*>/gi, name: "Embed tags" },
  { pattern: /<applet[\s\S]*?<\/applet>/gi, name: "Applet tags" },
  { pattern: /<meta[^>]*http-equiv[^>]*>/gi, name: "Meta refresh" },
  { pattern: /<link[^>]*>/gi, name: "Link tags" },
  { pattern: /<base[^>]*>/gi, name: "Base tags" },
  { pattern: /<form[\s\S]*?<\/form>/gi, name: "Form tags" },
  { pattern: /<input[^>]*>/gi, name: "Input tags" },
  { pattern: /<textarea[\s\S]*?<\/textarea>/gi, name: "Textarea tags" },
  { pattern: /<button[\s\S]*?<\/button>/gi, name: "Button tags" },
  { pattern: /<select[\s\S]*?<\/select>/gi, name: "Select tags" },
];

/**
 * Event handler patterns to remove
 * Matches quoted and unquoted attribute values
 */
const EVENT_HANDLER_PATTERN =
  /\s*on[a-zA-Z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi;

/**
 * Dangerous protocols to remove
 */
const DANGEROUS_PROTOCOLS = [
  { pattern: /javascript:/gi, name: "JavaScript protocol" },
  { pattern: /data:text\/html/gi, name: "Data HTML protocol" },
  { pattern: /data:text\/javascript/gi, name: "Data JS protocol" },
  { pattern: /vbscript:/gi, name: "VBScript protocol" },
  { pattern: /file:\/\//gi, name: "File protocol" },
  { pattern: /about:/gi, name: "About protocol" },
  { pattern: /chrome:/gi, name: "Chrome protocol" },
];

/**
 * Main function to validate scraped web content
 * @param html - Raw HTML content from web scraping
 * @returns Validation result with sanitized content and risk assessment
 */
export function validateScrapedContent(html: string): ValidationResult {
  if (!html || typeof html !== "string") {
    return {
      safe: "",
      removed: [],
      risk: "low",
      injectionDetected: false,
      injectionTypes: [],
      metadata: {
        originalLength: 0,
        cleanedLength: 0,
        removedPercentage: 0,
      },
    };
  }

  const originalLength = html.length;
  const removed: string[] = [];
  let risk: "low" | "medium" | "high" | "critical" = "low";
  let cleanedHtml = html;

  // 1. Remove dangerous HTML elements
  for (const { pattern, name } of DANGEROUS_PATTERNS) {
    const matches = cleanedHtml.match(pattern);
    if (matches && matches.length > 0) {
      removed.push(`${name} (${matches.length} occurrences)`);
      cleanedHtml = cleanedHtml.replace(pattern, "");

      // Increase risk level based on what was found
      if (name.includes("Script") || name.includes("Iframe")) {
        risk = risk === "low" ? "medium" : risk;
      }
    }
  }

  // 2. Remove event handlers
  const eventHandlerMatches = cleanedHtml.match(EVENT_HANDLER_PATTERN);
  if (eventHandlerMatches && eventHandlerMatches.length > 0) {
    removed.push(`Event handlers (${eventHandlerMatches.length} occurrences)`);
    cleanedHtml = cleanedHtml.replace(EVENT_HANDLER_PATTERN, "");
    risk = risk === "low" ? "medium" : risk;
  }

  // 3. Remove dangerous protocols
  for (const { pattern, name } of DANGEROUS_PROTOCOLS) {
    const matches = cleanedHtml.match(pattern);
    if (matches && matches.length > 0) {
      removed.push(`${name} (${matches.length} occurrences)`);
      cleanedHtml = cleanedHtml.replace(pattern, "");
      risk = "high"; // Protocol injections are high risk
    }
  }

  // 4. Check for injection attempts using pattern library
  const injectionCheck = checkForInjection(cleanedHtml);
  const injectionRisk = assessRisk(injectionCheck.matchedCategories);

  if (injectionCheck.hasInjection) {
    removed.push(
      `Injection patterns detected: ${injectionCheck.matchedCategories.join(", ")}`,
    );

    // Update risk based on injection severity
    if (injectionRisk === "critical") {
      risk = "critical";
    } else if (injectionRisk === "high") {
      risk = "high";
    } else if (injectionRisk === "medium" && risk === "low") {
      risk = "medium";
    }
  }

  // 5. Apply robust sanitization
  const sanitized = robustSanitize(cleanedHtml);

  // 6. Calculate metadata
  const cleanedLength = sanitized.length;
  const removedPercentage =
    originalLength > 0
      ? Math.round(
          Math.min(
            100,
            Math.max(
              0,
              ((originalLength - cleanedLength) / originalLength) * 100,
            ),
          ),
        )
      : 0;

  // 7. Adjust risk based on how much was removed
  if (removedPercentage > 50) {
    risk = risk === "low" ? "high" : risk === "medium" ? "high" : risk;
  } else if (removedPercentage > 25) {
    risk = risk === "low" ? "medium" : risk;
  }

  return {
    safe: sanitized,
    removed,
    risk,
    injectionDetected: injectionCheck.hasInjection,
    injectionTypes: injectionCheck.matchedCategories,
    metadata: {
      originalLength,
      cleanedLength,
      removedPercentage,
    },
  };
}

/**
 * Validate multiple pieces of web content
 * @param htmlArray - Array of HTML content to validate
 * @returns Array of validation results
 */
export function validateMultipleContent(
  htmlArray: string[],
): ValidationResult[] {
  return htmlArray.map((html) => validateScrapedContent(html));
}

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

/**
 * Validate URLs extracted from web content
 * @param url - URL to validate
 * @returns Whether the URL is safe to use
 */
export function isUrlSafe(url: string): boolean {
  if (!url || typeof url !== "string") {
    return false;
  }

  const lowerUrl = url.toLowerCase().trim();

  // Check for dangerous protocols
  const dangerousProtocols = [
    "javascript:",
    "data:",
    "vbscript:",
    "file:",
    "about:",
    "chrome:",
  ];

  for (const protocol of dangerousProtocols) {
    if (lowerUrl.startsWith(protocol)) {
      return false;
    }
  }

  // Check for encoded dangerous protocols
  if (lowerUrl.includes("%6a%61%76%61%73%63%72%69%70%74")) {
    // javascript
    return false;
  }

  // Allow only http, https, and relative URLs
  return (
    lowerUrl.startsWith("http://") ||
    lowerUrl.startsWith("https://") ||
    lowerUrl.startsWith("/") ||
    lowerUrl.startsWith("./") ||
    lowerUrl.startsWith("../")
  );
}

/**
 * Sanitize CSS content to prevent style-based attacks
 */
export function sanitizeCss(css: string): string {
  if (!css || typeof css !== "string") {
    return "";
  }

  let clean = css;

  // Remove CSS comments which can hide payloads
  clean = clean.replace(/\/\*[\s\S]*?\*\//g, "");

  // Remove javascript: protocol in CSS
  clean = clean.replace(/javascript:/gi, "");

  // Remove expression() (IE specific)
  clean = clean.replace(/expression\s*\([^)]*\)/gi, "");

  // Remove @import statements (can load external resources)
  clean = clean.replace(/@import[^;]+;/gi, "");

  // Remove behavior property (IE specific)
  clean = clean.replace(/behavior\s*:\s*[^;]+;/gi, "");

  // Remove -moz-binding (Firefox specific)
  clean = clean.replace(/-moz-binding\s*:\s*[^;]+;/gi, "");

  // Remove url(data:...) to prevent SVG/script vectors embedded as images
  clean = clean.replace(/url\(\s*(['"]?)\s*data:[^)]+\)/gi, "url()");

  return clean;
}

/**
 * Create a summary report of validation results
 */
export function createValidationReport(results: ValidationResult[]): {
  totalProcessed: number;
  safeContent: number;
  lowRisk: number;
  mediumRisk: number;
  highRisk: number;
  criticalRisk: number;
  averageRemovalPercentage: number;
  commonInjectionTypes: string[];
} {
  const report = {
    totalProcessed: results.length,
    safeContent: 0,
    lowRisk: 0,
    mediumRisk: 0,
    highRisk: 0,
    criticalRisk: 0,
    averageRemovalPercentage: 0,
    commonInjectionTypes: [] as string[],
  };

  const injectionTypeCount: Record<string, number> = {};
  let totalRemovalPercentage = 0;

  for (const result of results) {
    // Count risk levels
    switch (result.risk) {
      case "low":
        report.lowRisk++;
        if (!result.injectionDetected && result.removed.length === 0) {
          report.safeContent++;
        }
        break;
      case "medium":
        report.mediumRisk++;
        break;
      case "high":
        report.highRisk++;
        break;
      case "critical":
        report.criticalRisk++;
        break;
    }

    // Track injection types
    for (const type of result.injectionTypes) {
      injectionTypeCount[type] = (injectionTypeCount[type] || 0) + 1;
    }

    // Sum removal percentages
    totalRemovalPercentage += result.metadata.removedPercentage;
  }

  // Calculate averages and find common injection types
  report.averageRemovalPercentage =
    results.length > 0
      ? Math.round(totalRemovalPercentage / results.length)
      : 0;

  report.commonInjectionTypes = Object.entries(injectionTypeCount)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([type]) => type);

  return report;
}
