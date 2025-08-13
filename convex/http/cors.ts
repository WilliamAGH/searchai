/**
 * CORS utilities for HTTP endpoints
 */

/**
 * Helper function to add CORS headers to responses
 * - Allows all origins (*)
 * - Supports GET, POST, OPTIONS
 * - Returns JSON content type
 * @param body - JSON string response body
 * @param status - HTTP status code (default 200)
 * @returns Response with CORS headers
 */
export function corsResponse(body: string, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}

/**
 * CORS preflight response for OPTIONS requests
 * @param request - HTTP request
 * @returns CORS preflight response
 */
export function corsPreflightResponse(request: Request) {
  const requested = request.headers.get("Access-Control-Request-Headers");
  return new Response(null, {
    status: 204,
    headers: {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": requested || "Content-Type",
      "Access-Control-Max-Age": "600",
      Vary: "Origin",
    },
  });
}
