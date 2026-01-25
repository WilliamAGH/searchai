/**
 * URL utilities for normalization and validation
 */

/**
 * Safely parse a URL string without throwing or logging.
 * Returns null if the URL is invalid.
 */
export function safeParseUrl(url: string): URL | null {
  try {
    return new URL(url);
  } catch {
    return null;
  }
}

/**
 * Normalize URLs for comparison/deduplication.
 * - Returns null for invalid/missing inputs
 * - Strips hash fragments
 * - Preserves protocol and path
 */
export function normalizeUrl(rawUrl: string | undefined): string | null {
  if (!rawUrl || typeof rawUrl !== "string") return null;

  const parsed = safeParseUrl(rawUrl);
  if (!parsed) return null;

  parsed.hash = "";
  return parsed.toString();
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

  const u = safeParseUrl(normalized);
  if (!u) return normalized;

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
  paramsToStrip.forEach((p) => {
    u.searchParams.delete(p);
  });

  if (u.pathname !== "/" && u.pathname.endsWith("/")) {
    u.pathname = u.pathname.slice(0, -1);
  }

  return u.toString();
}

const IPV4_PATTERN = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/;

function parseIpv4Parts(hostname: string): number[] | null {
  const match = hostname.match(IPV4_PATTERN);
  if (!match) return null;
  const parts = match.slice(1).map((part) => Number(part));
  if (parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return null;
  }
  return parts;
}

function isIpv4PrivateParts([a, b]: number[]): boolean {
  if (a === 10) return true; // 10.0.0.0/8
  if (a === 127) return true; // loopback
  if (a === 0) return true; // 0.0.0.0/8
  if (a === 169 && b === 254) return true; // link-local 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return true; // 172.16.0.0/12
  if (a === 192 && b === 168) return true; // 192.168.0.0/16
  if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT 100.64.0.0/10
  return false;
}

function extractEmbeddedIpv4(hostname: string): number[] | null {
  const lastPart = hostname.split(":").pop();
  if (!lastPart || !lastPart.includes(".")) return null;
  return parseIpv4Parts(lastPart);
}

function parseIpv6ToBigInt(hostname: string): bigint | null {
  if (!hostname) return null;
  if (hostname.includes("%")) return null;
  const lower = hostname.toLowerCase();
  const doubleColonIndex = lower.indexOf("::");
  if (
    doubleColonIndex !== -1 &&
    lower.indexOf("::", doubleColonIndex + 1) !== -1
  ) {
    return null;
  }

  let head = lower;
  let tail = "";
  if (doubleColonIndex !== -1) {
    const parts = lower.split("::");
    head = parts[0] ?? "";
    tail = parts[1] ?? "";
  }

  const expandParts = (partsRaw: string[]) => {
    const parts: string[] = [];
    for (let i = 0; i < partsRaw.length; i++) {
      const part = partsRaw[i];
      if (!part) return null;
      if (part.includes(".")) {
        // RFC 4291 §2.2.3: IPv4-embedded address must have IPv4 as the final segment
        if (i !== partsRaw.length - 1) return null;
        const ipv4Parts = parseIpv4Parts(part);
        if (!ipv4Parts) return null;
        const part1 = ((ipv4Parts[0] << 8) | ipv4Parts[1]).toString(16);
        const part2 = ((ipv4Parts[2] << 8) | ipv4Parts[3]).toString(16);
        parts.push(part1, part2);
      } else {
        parts.push(part);
      }
    }
    return parts;
  };

  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];
  const expandedHead = expandParts(headParts);
  if (!expandedHead) return null;
  const expandedTail = expandParts(tailParts);
  if (!expandedTail) return null;

  let parts: string[];
  if (doubleColonIndex !== -1) {
    const fill = 8 - (expandedHead.length + expandedTail.length);
    if (fill < 0) return null;
    parts = [...expandedHead, ...Array(fill).fill("0"), ...expandedTail];
  } else {
    if (expandedHead.length !== 8) return null;
    parts = expandedHead;
  }

  if (parts.length !== 8) return null;

  let value = 0n;
  for (const part of parts) {
    const num = Number.parseInt(part, 16);
    if (!Number.isFinite(num) || num < 0 || num > 0xffff) return null;
    value = (value << 16n) + BigInt(num);
  }

  return value;
}

// IPv6 private/reserved address range boundaries (RFC 4193, RFC 4291)
const IPV6_UNIQUE_LOCAL_START = 0xfc00_0000_0000_0000_0000_0000_0000_0000n;
const IPV6_UNIQUE_LOCAL_END = 0xfdff_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
const IPV6_LINK_LOCAL_START = 0xfe80_0000_0000_0000_0000_0000_0000_0000n;
const IPV6_LINK_LOCAL_END = 0xfebf_ffff_ffff_ffff_ffff_ffff_ffff_ffffn;
const IPV6_IPV4_MAPPED_START = 0x0000_0000_0000_0000_0000_ffff_0000_0000n;
const IPV6_IPV4_MAPPED_END = 0x0000_0000_0000_0000_0000_ffff_ffff_ffffn;

function isIpv6Private(hostname: string): boolean {
  const embeddedIpv4 = extractEmbeddedIpv4(hostname);
  if (embeddedIpv4) {
    return isIpv4PrivateParts(embeddedIpv4);
  }

  const value = parseIpv6ToBigInt(hostname);
  if (value === null) {
    // Fail closed: treat unparseable IPv6 addresses as private to prevent bypass
    // This catches valid but unsupported syntax (e.g. zone IDs) as well as malformed input
    console.warn(
      `isIpv6Private: Failed to parse IPv6 address, treating as private: ${hostname}`,
    );
    return true;
  }

  // Unspecified (::) or loopback (::1)
  if (value === 0n || value === 1n) return true;

  // Unique local addresses (fc00::/7)
  if (value >= IPV6_UNIQUE_LOCAL_START && value <= IPV6_UNIQUE_LOCAL_END)
    return true;

  // Link-local addresses (fe80::/10)
  if (value >= IPV6_LINK_LOCAL_START && value <= IPV6_LINK_LOCAL_END)
    return true;

  // IPv4-mapped IPv6 addresses (::ffff:0:0/96)
  if (value >= IPV6_IPV4_MAPPED_START && value <= IPV6_IPV4_MAPPED_END) {
    const v4 = Number(value & 0xffffffffn);
    const parts = [
      (v4 >>> 24) & 0xff,
      (v4 >>> 16) & 0xff,
      (v4 >>> 8) & 0xff,
      v4 & 0xff,
    ];
    return isIpv4PrivateParts(parts);
  }

  return false;
}

function isPrivateAddress(hostname: string): boolean {
  const ipv4Parts = parseIpv4Parts(hostname);
  if (ipv4Parts) return isIpv4PrivateParts(ipv4Parts);
  if (hostname.includes(":")) return isIpv6Private(hostname);
  return false;
}

function isLocalhostAddress(hostname: string): boolean {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname === "::1" ||
    hostname === "0:0:0:0:0:0:0:1" ||
    hostname.startsWith("127.") ||
    hostname === "0.0.0.0"
  );
}

const BLOCKED_METADATA_HOSTS = new Set([
  "169.254.169.254", // AWS metadata
  "metadata.google.internal", // GCP metadata
  "metadata.azure.com", // Azure metadata
]);

export type ScrapeUrlValidation =
  | { ok: true; url: string }
  | { ok: false; error: string };

export function validateScrapeUrl(urlInput: string): ScrapeUrlValidation {
  const url = safeParseUrl(urlInput);
  if (!url) {
    return { ok: false, error: "Invalid URL format" };
  }

  if (!["http:", "https:"].includes(url.protocol)) {
    return { ok: false, error: "Invalid URL protocol" };
  }

  const rawHostname = url.hostname.toLowerCase();
  const hostname = rawHostname.replace(/^\[|\]$/g, "");

  const deployment = process.env.CONVEX_DEPLOYMENT;
  const isDevelopment =
    process.env.NODE_ENV === "development" ||
    Boolean(deployment && deployment.includes("dev"));

  if (!isDevelopment && isLocalhostAddress(hostname)) {
    return { ok: false, error: "Access to local addresses is not allowed" };
  }

  if (!isDevelopment && isPrivateAddress(hostname)) {
    return { ok: false, error: "Access to private networks is not allowed" };
  }

  if (BLOCKED_METADATA_HOSTS.has(hostname)) {
    return { ok: false, error: "Access to metadata endpoints is not allowed" };
  }

  return { ok: true, url: url.toString() };
}
