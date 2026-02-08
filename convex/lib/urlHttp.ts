import { safeParseUrl } from "./url";

const URL_SCHEME_PATTERN = /^[a-zA-Z][a-zA-Z\d+.-]*:\/\//;

function toBoundedUrl(serialized: string, maxLength?: number): string {
  return maxLength && maxLength > 0
    ? serialized.slice(0, maxLength)
    : serialized;
}

export function normalizeHttpUrl(
  value: unknown,
  maxLength?: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const direct = safeParseUrl(trimmed);
  if (direct && (direct.protocol === "http:" || direct.protocol === "https:")) {
    return toBoundedUrl(trimmed, maxLength);
  }

  if (!URL_SCHEME_PATTERN.test(trimmed) && trimmed.includes(".")) {
    const prefixed = safeParseUrl(`https://${trimmed}`);
    if (
      prefixed &&
      (prefixed.protocol === "http:" || prefixed.protocol === "https:")
    ) {
      return toBoundedUrl(prefixed.toString(), maxLength);
    }
  }

  return undefined;
}
