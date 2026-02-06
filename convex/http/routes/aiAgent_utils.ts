import { corsResponse, serializeError } from "../utils";
import { isRecord, type WebResearchSource } from "../../lib/validators";

/**
 * Regex pattern to match ASCII control characters (except tab, newline, carriage return)
 * Uses Unicode escapes to avoid Biome lint errors for literal control characters
 */
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/**
 * Validate and normalize URL to safe http/https protocols only.
 * Returns undefined for invalid URLs or non-http(s) protocols - safe by design.
 */
function safeParseUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    return url.toString().slice(0, 2000);
  } catch {
    // Invalid URL format - return undefined as intended
    return undefined;
  }
}

type JsonPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; response: Response };

export function rateLimitExceededResponse(
  resetAt: number,
  origin: string | null,
): Response {
  return corsResponse(
    JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    }),
    429,
    origin,
  );
}

export async function parseJsonPayload(
  request: Request,
  origin: string | null,
  logPrefix: string,
): Promise<JsonPayloadResult> {
  let rawPayload: unknown;
  try {
    rawPayload = await request.json();
  } catch (error) {
    const errorInfo = serializeError(error);
    console.error(`[ERROR] ${logPrefix} INVALID JSON:`, errorInfo);
    return {
      ok: false,
      response: corsResponse(
        JSON.stringify({
          error: "Invalid JSON body",
          ...(process.env.NODE_ENV === "development"
            ? { errorDetails: errorInfo }
            : {}),
        }),
        400,
        origin,
      ),
    };
  }

  if (!isRecord(rawPayload)) {
    return {
      ok: false,
      response: corsResponse(
        JSON.stringify({ error: "Invalid request payload" }),
        400,
        origin,
      ),
    };
  }

  return { ok: true, payload: rawPayload };
}

export function sanitizeTextInput(
  value: unknown,
  maxLength: number,
): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.replace(CONTROL_CHARS_PATTERN, "").slice(0, maxLength);
}

export function sanitizeWebResearchSources(
  input: unknown,
): WebResearchSource[] | undefined {
  if (!Array.isArray(input)) return undefined;

  return input
    .slice(0, 12)
    .map((refRaw) => {
      if (!isRecord(refRaw)) return null;
      const contextId =
        typeof refRaw.contextId === "string" ? refRaw.contextId : "";
      const type = refRaw.type;
      if (
        !contextId ||
        (type !== "search_result" &&
          type !== "scraped_page" &&
          type !== "research_summary")
      ) {
        return null;
      }

      const sanitized: WebResearchSource = {
        contextId,
        type,
        timestamp:
          typeof refRaw.timestamp === "number" ? refRaw.timestamp : Date.now(),
      };

      const safeUrl = safeParseUrl(refRaw.url);
      if (safeUrl) {
        sanitized.url = safeUrl;
      }
      if (typeof refRaw.title === "string") {
        sanitized.title = refRaw.title.slice(0, 500);
      }
      if (
        refRaw.relevanceScore !== undefined &&
        typeof refRaw.relevanceScore === "number"
      ) {
        sanitized.relevanceScore = refRaw.relevanceScore;
      }
      if (
        isRecord(refRaw.metadata) &&
        Object.keys(refRaw.metadata).length > 0
      ) {
        sanitized.metadata = refRaw.metadata;
      }

      return sanitized;
    })
    .filter((ref): ref is WebResearchSource => !!ref);
}
