/**
 * Zod Validation Utilities
 *
 * Canonical validation utilities for Zod v4. Importable by both Convex
 * backend (V8/Node) and frontend code.
 *
 * Per [VL1]: This module provides safe parsing with proper error logging.
 * Per [EH1]: Never swallow validation errors - always log with full context.
 * Per [ZV1]: Use discriminated unions, not null returns.
 *
 * @see {@link ../schemas/} - Canonical Zod schemas
 * @see {@link AGENTS.md} - [ZV1] validation error handling rules
 */

import { z } from "zod/v4";

// ============================================
// Result Type (Discriminated Union)
// ============================================

/**
 * Discriminated union for validation results.
 * Per [ZV1b]: Never return null - return explicit success/failure.
 */
export type ValidationResult<T> =
  | { success: true; data: T }
  | { success: false; error: z.ZodError };

// ============================================
// Type Guards
// ============================================

/**
 * Type guard for Record<string, unknown>.
 * Use at boundaries before accessing object properties.
 */
export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

// ============================================
// Error Logging
// ============================================

/**
 * Extract human-readable issue summaries from ZodError.
 * Zod v4 uses 'input' for failing value, 'received' for type errors.
 */
function formatZodIssues(error: z.ZodError, maxIssues = 10): string[] {
  return error.issues.slice(0, maxIssues).map((issue) => {
    const path = issue.path.length > 0 ? issue.path.join(".") : "(root)";

    // Zod v4: 'input' contains the failing value, 'received' for type errors
    const inputValue = "input" in issue ? issue.input : undefined;
    const receivedValue = "received" in issue ? issue.received : undefined;
    const actualValue = receivedValue ?? inputValue;

    const received =
      actualValue !== undefined
        ? ` (received: ${JSON.stringify(actualValue)})`
        : "";
    const expected =
      "expected" in issue ? ` (expected: ${issue.expected})` : "";

    return `  - ${path}: ${issue.message}${expected}${received}`;
  });
}

/**
 * Log Zod validation failure with full context.
 *
 * Per [EH1a]: Never swallow errors.
 * Per [ZV1c]: Every log must identify WHICH record failed.
 *
 * @param context - Descriptive context including record identifier
 * @param error - The ZodError or unknown error
 * @param payload - Optional raw payload for debugging
 *
 * @example
 * logZodFailure("parseSearchResult [url=example.com]", result.error, rawData);
 * // Output:
 * // [Zod] parseSearchResult [url=example.com] validation failed
 * // Issues:
 * //   - title: Required (expected: string) (received: undefined)
 * // Payload keys: url, snippet, relevance
 */
export function logZodFailure(
  context: string,
  error: unknown,
  payload?: unknown,
): void {
  // Summarize payload structure (keys only, not values)
  const payloadKeys =
    typeof payload === "object" && payload !== null
      ? Object.keys(payload).slice(0, 20)
      : [];

  if (error instanceof z.ZodError) {
    const issueSummaries = formatZodIssues(error);

    // Log as readable string - NOT collapsed object
    console.error(
      `[Zod] ${context} validation failed\n` +
        `Issues:\n${issueSummaries.join("\n")}\n` +
        `Payload keys: ${payloadKeys.join(", ")}`,
    );

    // Also log full details for deep debugging
    console.error(`[Zod] ${context} - full details:`, {
      prettifiedError: z.prettifyError(error),
      issues: error.issues,
      payload,
    });
  } else {
    console.error(`[Zod] ${context} validation failed (non-ZodError):`, error);
  }
}

// ============================================
// Safe Parse with Logging
// ============================================

/**
 * Safe parse with automatic failure logging.
 *
 * Per [ZV1a]: Use safeParse, never parse().
 * Per [ZV1b]: Return discriminated union, not null.
 * Per [ZV1c]: Log failures with record identifier.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Raw unknown data to validate
 * @param context - Context string including record identifier
 * @returns Discriminated union with success/failure
 *
 * @example
 * const result = safeParseWithLog(SearchResultSchema, data, "searchResult [idx=0]");
 * if (result.success) {
 *   // result.data is typed
 * } else {
 *   // result.error is ZodError (already logged)
 * }
 */
export function safeParseWithLog<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: string,
): ValidationResult<T> {
  const result = schema.safeParse(raw);

  if (!result.success) {
    logZodFailure(context, result.error, raw);
    return { success: false, error: result.error };
  }

  return { success: true, data: result.data };
}

/**
 * Safe parse that returns data or null (for legacy compatibility).
 *
 * IMPORTANT: This logs failures but returns null for backward compatibility.
 * Prefer safeParseWithLog for new code.
 *
 * @param schema - Zod schema to validate against
 * @param raw - Raw unknown data to validate
 * @param context - Context string including record identifier
 * @returns Parsed data or null (failure is logged)
 */
export function safeParseOrNull<T>(
  schema: z.ZodType<T>,
  raw: unknown,
  context: string,
): T | null {
  const result = safeParseWithLog(schema, raw, context);
  return result.success ? result.data : null;
}

// ============================================
// Array Parsing with Per-Item Logging
// ============================================

/**
 * Parse an array with per-item validation and logging.
 *
 * Invalid items are logged and filtered out, but valid items are returned.
 * Use when partial success is acceptable (e.g., search results where
 * some may be malformed).
 *
 * @param schema - Schema for individual items
 * @param items - Array of unknown items
 * @param contextPrefix - Context prefix (item index is appended)
 * @returns Array of valid items (invalid items logged and skipped)
 *
 * @example
 * const results = parseArrayWithLogging(
 *   SearchResultSchema,
 *   response.results,
 *   "searchResults"
 * );
 * // Logs: [Zod] searchResults[2] validation failed...
 */
export function parseArrayWithLogging<T>(
  schema: z.ZodType<T>,
  items: unknown[],
  contextPrefix: string,
): T[] {
  const valid: T[] = [];

  for (let i = 0; i < items.length; i++) {
    const result = schema.safeParse(items[i]);
    if (result.success) {
      valid.push(result.data);
    } else {
      logZodFailure(`${contextPrefix}[${i}]`, result.error, items[i]);
    }
  }

  return valid;
}
