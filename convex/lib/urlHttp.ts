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

function normalizeHttpInput(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return normalizeHttpCandidate(trimmed);
}

export function safeParseHttpUrl(value: string): URL | null {
  const candidate = normalizeHttpInput(value);
  if (!candidate) {
    return null;
  }
  const parsed = safeParseUrl(candidate);
  if (!parsed || (parsed.protocol !== "http:" && parsed.protocol !== "https:")) {
    return null;
  }
  return parsed;
}

export function normalizeHttpUrl(
  value: unknown,
  maxLength?: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const parsed = safeParseHttpUrl(value);
  if (!parsed) {
    return undefined;
  }
  return toBoundedUrl(parsed.toString(), maxLength);
}
