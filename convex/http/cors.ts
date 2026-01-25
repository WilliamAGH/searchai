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
  const origins = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return normalizeDevOrigins(origins);
}

/**
 * Merge development convenience origins for Vite dev/preview servers.
 * Ensures all common dev ports (5173, 5174) and preview port (4173) are accepted.
 * Also includes 127.0.0.1 variants since browsers treat localhost vs 127.0.0.1 as different origins.
 */
const DEV_VITE_ORIGINS = new Set([
  // Dev server (vite dev)
  "http://localhost:5173",
  "http://localhost:5174",
  "http://127.0.0.1:5173",
  "http://127.0.0.1:5174",
  "https://localhost:5173",
  "https://localhost:5174",
  // Preview server (vite preview)
  "http://localhost:4173",
  "http://127.0.0.1:4173",
  "https://localhost:4173",
]);

function normalizeDevOrigins(origins: string[]): string[] {
  const set = new Set(origins);

  // If any localhost/127.0.0.1 Vite origin is present, ensure all dev/preview ports are allowed.
  const hasLocalDevOrigin = origins.some(
    (origin) =>
      origin.includes("localhost:5173") ||
      origin.includes("localhost:5174") ||
      origin.includes("localhost:4173") ||
      origin.includes("127.0.0.1:5173") ||
      origin.includes("127.0.0.1:5174") ||
      origin.includes("127.0.0.1:4173"),
  );

  if (hasLocalDevOrigin) {
    for (const devOrigin of DEV_VITE_ORIGINS) {
      set.add(devOrigin);
    }
  }

  return Array.from(set);
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
