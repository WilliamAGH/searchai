import { serializeError } from "../utils";

/**
 * Helper: determine allowed origin (env-driven; defaults to *)
 */
export function getAllowedOrigin(origin: string | null): string {
  const allowed = process.env.CONVEX_ALLOWED_ORIGINS;
  if (!allowed || allowed === "*") return "*";
  const list = allowed
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (!origin) return list[0] || "*";
  return list.includes(origin) ? origin : list[0] || "*";
}

/**
 * Build a JSON response with CORS headers [DRY1]
 */
export function buildCorsJsonResponse(
  request: Request,
  body: Record<string, unknown> | string,
  status: number,
  extraHeaders?: Record<string, string>,
): Response {
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  const jsonBody = typeof body === "string" ? body : JSON.stringify(body);
  return new Response(jsonBody, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
      ...extraHeaders,
    },
  });
}

/**
 * Build a text/HTML response with CORS headers [DRY1]
 */
export function buildCorsTextResponse(
  request: Request,
  body: string,
  status: number,
  contentType: string,
  extraHeaders?: Record<string, string>,
): Response {
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  return new Response(body, {
    status,
    headers: {
      "Content-Type": contentType,
      "Access-Control-Allow-Origin": allowOrigin,
      Vary: "Origin",
      ...extraHeaders,
    },
  });
}

/**
 * Build a CORS preflight response
 */
export function buildCorsPreflightResponse(request: Request, methods: string): Response {
  const requested = request.headers.get("Access-Control-Request-Headers");
  const origin = request.headers.get("Origin");
  const allowOrigin = getAllowedOrigin(origin);
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": allowOrigin,
      "Access-Control-Allow-Methods": methods,
      "Access-Control-Allow-Headers": requested || "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

export function logInvalidJson(error: unknown) {
  console.error("[ERROR] PUBLISH INVALID JSON:", serializeError(error));
}
