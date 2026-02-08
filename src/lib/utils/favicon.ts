const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

export function safeParseHttpUrl(url: string): URL | null {
  const trimmed = url.trim();
  if (!trimmed) return null;

  const normalized = trimmed.startsWith("//")
    ? `https:${trimmed}`
    : URL_SCHEME_PATTERN.test(trimmed)
      ? trimmed
      : !trimmed.includes(".")
        ? null
        : `https://${trimmed}`;
  if (!normalized) {
    return null;
  }

  try {
    const parsed = new URL(normalized);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Extract domain from URL, stripping www. prefix
 * - Used for citation display and matching
 */
export function getDomainFromUrl(url: string): string {
  const parsed = safeParseHttpUrl(url);
  if (!parsed) {
    return "";
  }
  return parsed.hostname.replace(/^www\./, "");
}

/**
 * Extract hostname from URL safely
 * - Handles malformed URLs and bare hostnames
 */
export function getSafeHostname(url: string): string {
  const parsed = safeParseHttpUrl(url);
  if (!parsed) {
    return "";
  }
  return parsed.hostname;
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
