/**
 * Extract hostname from URL safely
 * - Handles malformed URLs and bare hostnames
 */
export function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch {
    try {
      return new URL(`https://${url}`).hostname;
    } catch {
      return "";
    }
  }
}

/**
 * Get favicon URL from DuckDuckGo icon service
 * - Returns null if hostname invalid
 */
export function getFaviconUrl(url: string): string | null {
  const hostname = getSafeHostname(url);
  if (!hostname) return null;
  return `https://icons.duckduckgo.com/ip3/${hostname}.ico`;
}
