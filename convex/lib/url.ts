/**
 * URL utilities for normalization and validation
 */

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
  try {
    const u = new URL(rawUrl);
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

    u.hash = "";

    if (u.pathname !== "/" && u.pathname.endsWith("/")) {
      u.pathname = u.pathname.slice(0, -1);
    }

    return u.toString();
  } catch {
    // Fallback for invalid URLs
    return (rawUrl || "").trim();
  }
}
