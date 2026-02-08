import { serializeError } from "../utils";
import { corsResponse } from "../cors";
import { normalizeHttpUrl } from "../../lib/urlHttp";
import { isRecord, type WebResearchSource } from "../../lib/validators";

/**
 * Regex pattern to match ASCII control characters (except tab, newline, carriage return)
 * Uses Unicode escapes to avoid Biome lint errors for literal control characters
 */
const CONTROL_CHARS_PATTERN = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;

/** Sanitization limits for user-provided web research source fields */
const MAX_URL_LENGTH = 2000;
const MAX_TITLE_LENGTH = 500;
const MAX_SOURCES_PER_REQUEST = 12;

/**
 * Clamp a relevance score to the valid [0, 1] range.
 */
function clampRelevanceScore(score: number): number {
  if (score < 0) return 0;
  if (score > 1) return 1;
  return score;
}

/**
 * Validate and normalize URL to safe http/https protocols only.
 * Returns undefined for invalid URLs or non-http(s) protocols - safe by design.
 */
function safeParseUrl(value: unknown): string | undefined {
  return normalizeHttpUrl(value, MAX_URL_LENGTH);
}

type JsonPayloadResult =
  | { ok: true; payload: Record<string, unknown> }
  | { ok: false; response: Response };

export function rateLimitExceededResponse(
  resetAt: number,
  origin: string | null,
): Response {
  return corsResponse({
    body: JSON.stringify({
      error: "Rate limit exceeded",
      message: "Too many requests. Please try again later.",
      retryAfter: Math.ceil((resetAt - Date.now()) / 1000),
    }),
    status: 429,
    origin,
  });
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
      response: corsResponse({
        body: JSON.stringify({
          error: "Invalid JSON body",
          ...(process.env.NODE_ENV === "development"
            ? { errorDetails: errorInfo }
            : {}),
        }),
        status: 400,
        origin,
      }),
    };
  }

  if (!isRecord(rawPayload)) {
    return {
      ok: false,
      response: corsResponse({
        body: JSON.stringify({ error: "Invalid request payload" }),
        status: 400,
        origin,
      }),
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
    .slice(0, MAX_SOURCES_PER_REQUEST)
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
      } else if (refRaw.url !== undefined) {
        console.warn("[http] Stripped invalid URL from source", {
          contextId,
          originalUrl:
            typeof refRaw.url === "string"
              ? refRaw.url.slice(0, 200)
              : typeof refRaw.url,
        });
      }
      if (typeof refRaw.title === "string") {
        sanitized.title = refRaw.title.slice(0, MAX_TITLE_LENGTH);
      }
      if (
        refRaw.relevanceScore !== undefined &&
        typeof refRaw.relevanceScore === "number" &&
        !Number.isNaN(refRaw.relevanceScore)
      ) {
        sanitized.relevanceScore = clampRelevanceScore(refRaw.relevanceScore);
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
