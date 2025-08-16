/**
 * Lightweight server-side debug logger for Convex functions
 * - Always safe to import; Convex logs are visible via `npx convex logs`
 * - Keep usage minimal to avoid noise; focus on inputs/outputs/errors
 */

export function debug(...args: unknown[]) {
  // Intentionally not gated behind env var to ensure availability in prod logs
  // Keep callsites concise and informative
  console.log("[DEBUG]", ...args);
}

export function debugStart(fn: string, payload?: Record<string, unknown>) {
  console.log("[DEBUG] ▶", fn, payload || {});
}

export function debugEnd(fn: string, result?: Record<string, unknown>) {
  console.log("[DEBUG] ■", fn, result || {});
}

export function debugError(fn: string, error: unknown) {
  console.error("[DEBUG] ✖", fn, error);
}
