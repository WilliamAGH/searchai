const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;
const DOMAIN_PREFIX_PATTERN = /^www\./;
const FAVICON_ICON_CACHE = new Map<string, string>();
const FAVICON_SIZE = 16;
const FAVICON_RADIUS = 4;

function normalizeHostname(hostname: string): string {
  return hostname.toLowerCase().replace(/\.+$/, "");
}

function toCanonicalHostname(url: string, stripWww: boolean): string | null {
  const parsed = safeParseHttpUrl(url);
  if (!parsed) return null;

  const normalized = normalizeHostname(parsed.hostname);
  if (!normalized) return null;
  return stripWww ? normalized.replace(DOMAIN_PREFIX_PATTERN, "") : normalized;
}

function hashText(value: string): number {
  let hash = 0;
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  return hash;
}

function getInitial(hostname: string): string {
  const first = hostname.charAt(0);
  return /^[A-Za-z0-9]$/.test(first) ? first.toUpperCase() : "?";
}

function buildFaviconDataUrl(hostname: string): string {
  const hue = hashText(hostname) % 360;
  const fill = `hsl(${hue} 62% 42%)`;
  const stroke = `hsl(${(hue + 35) % 360} 58% 30%)`;
  const initial = getInitial(hostname);

  const svg = [
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${FAVICON_SIZE} ${FAVICON_SIZE}'>`,
    `<rect x='0' y='0' width='${FAVICON_SIZE}' height='${FAVICON_SIZE}' rx='${FAVICON_RADIUS}' fill='${fill}' stroke='${stroke}'/>`,
    `<text x='50%' y='54%' text-anchor='middle' dominant-baseline='middle' font-size='9' font-family='system-ui, sans-serif' fill='#fff'>${initial}</text>`,
    "</svg>",
  ].join("");

  return `data:image/svg+xml,${encodeURIComponent(svg)}`;
}

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
  if (!normalized) return null;

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
  return toCanonicalHostname(url, true) ?? "";
}

/**
 * Extract hostname from URL safely
 * - Handles malformed URLs and bare hostnames
 */
export function getSafeHostname(url: string): string {
  return toCanonicalHostname(url, false) ?? "";
}

/**
 * Build a deterministic in-app source icon.
 * Avoids flaky external favicon providers and 404 spam in the console.
 */
export function getFaviconUrl(url: string): string | null {
  const hostname = getDomainFromUrl(url);
  if (!hostname) return null;

  const cached = FAVICON_ICON_CACHE.get(hostname);
  if (cached) return cached;

  const dataUrl = buildFaviconDataUrl(hostname);
  FAVICON_ICON_CACHE.set(hostname, dataUrl);
  return dataUrl;
}
