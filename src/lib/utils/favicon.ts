import { logger } from "../logger";

/**
 * Extract hostname from URL safely
 * - Handles malformed URLs and bare hostnames
 */
export function getSafeHostname(url: string): string {
  try {
    return new URL(url).hostname;
  } catch (error) {
    logger.warn("Failed to parse URL for hostname", { url, error });
    try {
      return new URL(`https://${url}`).hostname;
    } catch (fallbackError) {
      logger.warn("Failed to parse hostname with https:// fallback", {
        url,
        error: fallbackError,
      });
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
