/**
 * CORS utilities for HTTP endpoints with strict origin validation
 */

/**
 * Get allowed origins from environment variable
 * Returns null if CONVEX_ALLOWED_ORIGINS is not set (rejects all cross-origin requests)
 */
function getAllowedOrigins(): string[] | null {
  const raw = (process.env.CONVEX_ALLOWED_ORIGINS || "").trim();
  if (!raw) {
    console.warn(
      "⚠️ CONVEX_ALLOWED_ORIGINS not set - API will reject all cross-origin requests",
    );
    return null;
  }
  return raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}

/**
 * Validate if origin is allowed
 * Returns the validated origin or null if not allowed
 */
function validateOrigin(requestOrigin: string | null): string | null {
  if (!requestOrigin) {
    // No origin header means same-origin or direct API call
    // For security, we reject these by default
    return null;
  }

  const allowList = getAllowedOrigins();
  if (!allowList || allowList.length === 0) {
    return null; // No origins allowed
  }

  // Check exact match
  if (allowList.includes(requestOrigin)) {
    return requestOrigin;
  }

  // Check if request origin matches allowed patterns
  for (const allowed of allowList) {
    // Support wildcard subdomains: *.example.com
    if (allowed.startsWith("*.")) {
      const domain = allowed.slice(2);
      if (
        requestOrigin.endsWith(`.${domain}`) ||
        requestOrigin === `https://${domain}`
      ) {
        return requestOrigin;
      }
    }
  }

  console.warn(
    `🚫 Rejected request from unauthorized origin: ${requestOrigin}`,
  );
  return null;
}

/**
 * Helper function to add CORS headers to responses with strict origin validation
 * @param body - JSON string response body
 * @param status - HTTP status code (default 200)
 * @param requestOrigin - Origin header from request
 * @returns Response with CORS headers or 403 if origin not allowed
 */
export function corsResponse(
  body: string,
  status = 200,
  requestOrigin?: string | null,
) {
  // If no origin provided, reject (backward compatibility issue - caller must pass origin)
  if (requestOrigin === undefined) {
    console.error(
      "⚠️ corsResponse called without origin - update caller to pass request.headers.get('Origin')",
    );
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const validOrigin = validateOrigin(requestOrigin);
  if (!validOrigin) {
    return new Response(JSON.stringify({ error: "Unauthorized origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": validOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Credentials": "false",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/**
 * CORS preflight response for OPTIONS requests with strict origin validation
 * @param request - HTTP request
 * @returns CORS preflight response or 403 if origin not allowed
 */
export function corsPreflightResponse(request: Request) {
  const requestOrigin = request.headers.get("Origin");
  const validOrigin = validateOrigin(requestOrigin);

  if (!validOrigin) {
    return new Response(JSON.stringify({ error: "Unauthorized origin" }), {
      status: 403,
      headers: { "Content-Type": "application/json" },
    });
  }

  const requested = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": validOrigin,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requested || "Content-Type",
      "Access-Control-Allow-Credentials": "false",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
