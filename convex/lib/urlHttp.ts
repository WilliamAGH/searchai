import { safeParseUrl } from "./url";

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

function toBoundedUrl(serialized: string, maxLength?: number): string {
  return maxLength && maxLength > 0
    ? serialized.slice(0, maxLength)
    : serialized;
}

function normalizeHttpCandidate(trimmed: string): string | undefined {
  if (trimmed.startsWith("//")) {
    return `https:${trimmed}`;
  }
  if (URL_SCHEME_PATTERN.test(trimmed)) {
    return trimmed;
  }
  if (!trimmed.includes(".")) {
    return undefined;
  }
  return `https://${trimmed}`;
}

export function normalizeHttpUrl(
  value: unknown,
  maxLength?: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const candidate = normalizeHttpCandidate(trimmed);
  if (!candidate) {
    return undefined;
  }
  const parsed = safeParseUrl(candidate);
  if (
    !parsed ||
    (parsed.protocol !== "http:" && parsed.protocol !== "https:")
  ) {
    return undefined;
  }
  return toBoundedUrl(parsed.toString(), maxLength);
}
