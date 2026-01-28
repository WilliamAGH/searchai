import { corsResponse, serializeError } from "../utils";
import type { ResearchContextReference } from "../../schemas/agents";

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
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
    console.error(`[ERROR] ${logPrefix} INVALID JSON:`, serializeError(error));
    return {
      ok: false,
      response: corsResponse(
        JSON.stringify({
          error: "Invalid JSON body",
          errorDetails: serializeError(error),
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
  return value
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, "")
    .slice(0, maxLength);
}

export function sanitizeContextReferences(
  input: unknown,
): ResearchContextReference[] | undefined {
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

      const sanitized: ResearchContextReference = {
        contextId,
        type,
        timestamp:
          typeof refRaw.timestamp === "number" ? refRaw.timestamp : Date.now(),
      };

      if (typeof refRaw.url === "string") {
        sanitized.url = refRaw.url.slice(0, 2000);
      }
      if (typeof refRaw.title === "string") {
        sanitized.title = refRaw.title.slice(0, 500);
      }
      if (typeof refRaw.relevanceScore === "number") {
        sanitized.relevanceScore = refRaw.relevanceScore;
      }
      if (
        refRaw.metadata !== null &&
        refRaw.metadata !== undefined &&
        !(
          typeof refRaw.metadata === "object" &&
          Object.keys(refRaw.metadata).length === 0
        )
      ) {
        sanitized.metadata = refRaw.metadata;
      }

      return sanitized;
    })
    .filter((ref): ref is ResearchContextReference => !!ref);
}
