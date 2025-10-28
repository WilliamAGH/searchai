/**
 * Date/Time formatting helpers
 * - V8/Node compatible (no Node-only imports)
 * - Standardized temporal header for prompts and logs
 */

/** Pacific Time IANA identifier used across the codebase */
export const PACIFIC_TZ = "America/Los_Angeles" as const;

/**
 * Format the given date (default now) into a compact UTC string.
 * Example: 2025-10-27 19:02:33.123Z
 */
export function formatUtc(now: Date = new Date()): string {
  return now.toISOString().replace("T", " ");
}

/**
 * Format the given date (default now) into a Pacific Time string with tz short name.
 * Example: 10/27/2025, 12:02:33 PDT
 */
export function formatPacificTime(now: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: PACIFIC_TZ,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
    timeZoneName: "short",
  }).format(now);
}

/**
 * Build a standardized temporal header for prompts.
 * CURRENT DATE/TIME:
 * - UTC: <utc>
 * - PT: <pt> (America/Los_Angeles)
 */
export function buildTemporalHeader(now: Date = new Date()): string {
  const utc = formatUtc(now);
  const pt = formatPacificTime(now);
  return `CURRENT DATE/TIME:\n- UTC: ${utc}\n- PT: ${pt} (${PACIFIC_TZ})`;
}
