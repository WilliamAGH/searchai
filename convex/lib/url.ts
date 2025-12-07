/**
 * URL utilities for normalization and validation
 */

/**
 * Normalize URLs for comparison/deduplication.
 * - Returns null for invalid/missing inputs
 * - Strips hash fragments
 * - Preserves protocol and path
 */
export function normalizeUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;
  try {
    const parsed = new URL(rawUrl);
    parsed.hash = "";
    return parsed.toString();
  } catch {
    return null;
  }
}

/**
 * Normalize URLs for stable deduplication and deterministic ranking
 * - Lowercases hostname
 * - Removes www. prefix
 * - Strips common tracking parameters
 * - Removes hash
 * - Trims trailing slash from paths
 * @param rawUrl - Raw URL string to normalize
 * @returns Normalized URL string
 */
export function normalizeUrlForKey(rawUrl: string): string {
  const normalized = normalizeUrl(rawUrl);
  if (!normalized) {
    // Fallback for invalid URLs
    // Ensure we still try to strip the hash if possible, even if it's not a valid URL
    const trimmed = (rawUrl || "").trim();
    const hashIndex = trimmed.indexOf("#");
    return hashIndex !== -1 ? trimmed.slice(0, hashIndex) : trimmed;
  }

  try {
    const u = new URL(normalized);
    u.hostname = u.hostname.toLowerCase().replace(/^www\./, "");

    // Strip common tracking params
    const paramsToStrip = [
      "utm_source",
      "utm_medium",
      "utm_campaign",
      "utm_term",
      "utm_content",
      "gclid",
      "fbclid",
      "ref",
    ];
    paramsToStrip.forEach((p) => u.searchParams.delete(p));

    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    return normalized;
  }
}
